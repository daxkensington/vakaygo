import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { publicDestinations } from "@/server/public-listing-eligibility";
import { z } from "zod";
import { requireUser } from "@/server/admin-auth";
import { env } from "@/lib/env";
import {
  searchListings,
  getListingDetails,
  checkAvailability,
} from "@/server/trip-planner-tools";

import { logger } from "@/lib/logger";
import { planningDate as date, projectTripPlan } from "@/server/trip-planner-response";
export const maxDuration = 60;

const UNAVAILABLE = {
  code: "TRIP_PLANNER_UNAVAILABLE",
  error: "Trip planning is temporarily unavailable. Your preferences are kept so you can try again. For help, contact hello@vakaygo.com.",
};
const requestSchema = z.object({
  islandId: z.number().int().positive(), startDate: date, endDate: date,
  guestCount: z.number().int().min(1).max(50).default(2),
  budget: z.enum(["Budget", "Mid-Range", "Luxury"]).default("Mid-Range"),
  pace: z.enum(["relaxed", "moderate", "active"]).default("moderate"),
  interests: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  specialRequests: z.string().trim().max(2000).default(""),
}).refine(value => {
  const days = (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000;
  return days > 0 && days <= 30;
}, { message: "Choose an end date after your start date, within 30 days." });
function getDb() {
  return drizzle(neon(env.DATABASE_URL));
}

async function runWhileActive<T>(signal: AbortSignal, work: () => PromiseLike<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(
      value => { signal.removeEventListener("abort", aborted); resolve(value); },
      error => { signal.removeEventListener("abort", aborted); reject(error); },
    );
  });
}

const SYSTEM_PROMPT = `You select listings and suggested planning slots for VakayGo trips.
You MUST search the real directory before selecting listings. Use only listing IDs returned by the tools on the requested destination.
Return JSON only: {"days":[{"dayNumber":1,"date":"YYYY-MM-DD","items":[{"timeSlot":"morning|afternoon|evening","type":"stay|tour|dining|event|excursion|transport|transfer|guide|spa|vip|free","listingId":"known uuid or null"}]}]}.
Include each requested day in order. Use null with type free for personal time; this label means an unassigned planning slot, never free admission.
Match the requested pace, interests and budget preference without estimating prices. Do not supply narrative, cost totals, venue hours, admission, access or reservation claims.
Missing/null/zero platform prices and booking ineligibility do not establish free visitor admission or current access. Tool availability concerns platform booking only, never opening hours or walk-in access.
The server supplies titles, notes and explicit unconfirmed visitor-fact labels. Planning slots are suggestions, not confirmed venue hours.`;

const CLAUDE_TOOLS = [
  {
    name: "search_listings",
    description:
      "Search for real VakayGo listings to include in the itinerary. Use this to find stays, tours, dining, events, excursions, transfers, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["stay", "tour", "dining", "event", "excursion", "transport", "transfer", "spa"],
          description: "Type of listing to search for",
        },
        island: {
          type: "string",
          description: "Island slug to search on (e.g. 'grenada', 'barbados')",
        },
        q: {
          type: "string",
          description: "Search query for listing titles",
        },
        maxPrice: {
          type: "number",
          description: "Maximum price filter",
        },
        minRating: {
          type: "number",
          description: "Minimum rating filter (0-5)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
    },
  },
  {
    name: "get_listing_details",
    description: "Get full details about a specific listing by its ID",
    input_schema: {
      type: "object" as const,
      properties: {
        listingId: {
          type: "string",
          description: "The UUID of the listing",
        },
      },
      required: ["listingId"],
    },
  },
  {
    name: "check_availability",
    description: "Check if a listing is available on a specific date",
    input_schema: {
      type: "object" as const,
      properties: {
        listingId: {
          type: "string",
          description: "The UUID of the listing",
        },
        date: {
          type: "string",
          description: "Date to check in YYYY-MM-DD format",
        },
      },
      required: ["listingId", "date"],
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleToolCall(name: string, input: any) {
  switch (name) {
    case "search_listings":
      return await searchListings({
        type: input.type,
        island: input.island,
        q: input.q,
        maxPrice: input.maxPrice,
        minRating: input.minRating,
        limit: input.limit,
      });
    case "get_listing_details":
      return await getListingDetails(input.listingId);
    case "check_availability":
      return await checkAvailability(input.listingId, input.date);
    default:
      return { error: "Unknown tool" };
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Select an island, valid dates up to 30 days apart, and valid trip preferences." }, { status: 400 });
    const {
      islandId,
      startDate,
      endDate,
      guestCount = 2,
      budget = "Mid-Range",
      interests = [],
      pace = "moderate",
      specialRequests = "",
    } = parsed.data;
    const anthropicKey = env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return NextResponse.json(UNAVAILABLE, { status: 503 });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);

    const db = getDb();

    // Get island info
    const [island] = await runWhileActive(signal, () => db
      .select({ id: islands.id, name: islands.name, slug: islands.slug })
      .from(islands)
      .where(and(eq(islands.id, islandId), publicDestinations()))
      .limit(1));

    if (!island) {
      return NextResponse.json({ error: "Island not found" }, { status: 404 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Build user prompt
    const userPrompt = `Plan a ${days}-day trip to ${island.name} (island slug: "${island.slug}").

Dates: ${startDate} to ${endDate}
Guests: ${guestCount}
Budget: ${budget}
Pace: ${pace}
Interests: ${interests.length > 0 ? interests.join(", ") : "General sightseeing"}
${specialRequests ? `Special requests: ${specialRequests}` : ""}

Search for real listings on this island and build a day-by-day itinerary. Start by searching for different listing types (stays, tours, dining, excursions) on the island "${island.slug}", then assemble the best options into a cohesive trip plan.`;

    // Call Claude with tool use loop
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: "user", content: userPrompt }];
    let itineraryData: unknown = null;
    let catalogLookupCompleted = false;
    const MAX_ITERATIONS = 8;
    const knownListings = new Map<string, Awaited<ReturnType<typeof getListingDetails>> & {}>();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      signal.throwIfAborted();
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_CONCIERGE_MODEL,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          tools: CLAUDE_TOOLS,
          messages,
        }),
        signal,
      });

      if (!res.ok) {
        logger.error("Trip planner provider request failed", null, { status: res.status });
        return NextResponse.json(UNAVAILABLE, { status: 503 });
      }

      const data = await res.json();
      const { content, stop_reason } = data;
      signal.throwIfAborted();
      if (!Array.isArray(content)) return NextResponse.json(UNAVAILABLE, { status: 503 });

      // Add assistant response to messages
      messages.push({ role: "assistant", content });

      if (stop_reason === "end_turn") {
        // Extract JSON from the response
        const textBlock = content.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (block: any) => block.type === "text"
        );
        if (textBlock?.text) {
          try {
            // Try to parse the full text as JSON first
            const cleaned = textBlock.text
              .replace(/^```(?:json)?\n?/g, "")
              .replace(/\n?```$/g, "")
              .trim();
            itineraryData = JSON.parse(cleaned);
          } catch {
            // Try to extract JSON from the text
            const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                itineraryData = JSON.parse(jsonMatch[0]);
              } catch {
                logger.error("Failed to parse itinerary JSON");
              }
            }
          }
        }
        break;
      }

      if (stop_reason === "tool_use") {
        // Process tool calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolUseBlocks = content.filter((block: any) => block.type === "tool_use");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolResults: any[] = [];

        for (const toolUse of toolUseBlocks) {
          signal.throwIfAborted();
          try {
            const result = await runWhileActive(signal, () => handleToolCall(toolUse.name, toolUse.input));
            signal.throwIfAborted();
            if (toolUse.name === "search_listings" && Array.isArray(result)) {
              catalogLookupCompleted = true;
              for (const listing of result) knownListings.set(listing.id, listing);
            } else if (toolUse.name === "get_listing_details" && result && "id" in result) {
              catalogLookupCompleted = true;
              knownListings.set(result.id, result);
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            if (signal.aborted) throw err;
            logger.error("Trip generate tool failed", err, { tool: toolUse.name });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: "Tool execution failed" }),
              is_error: true,
            });
          }
        }

        messages.push({ role: "user", content: toolResults });
      }
    }

    const itinerary = catalogLookupCompleted ? projectTripPlan(itineraryData, {
      islandName: island.name, islandSlug: island.slug, startDate, days, listings: knownListings,
    }) : null;
    if (!itinerary) return NextResponse.json(UNAVAILABLE, { status: 503 });

    const itemValues: {
      listingId: string | null;
      dayNumber: number;
      timeSlot: string;
      customTitle: string;
      customNote: string | null;
      sortOrder: number;
    }[] = [];

    for (const day of itinerary.days) {
      for (const [index, item] of day.items.entries()) {
        itemValues.push({ listingId: item.listingId, dayNumber: day.dayNumber, timeSlot: item.timeSlot,
          customTitle: item.title, customNote: item.note, sortOrder: index });
      }
    }
    signal.throwIfAborted();
    // One PostgreSQL statement commits the trip and all items together. The
    // actor lock checks the current session after the potentially long AI call.
    const result = await db.execute(sql`
      WITH actor AS (
        SELECT id FROM users WHERE id=${auth.userId}::uuid
          AND session_version=${auth.sessionVersion} AND role=${auth.role}
          AND coalesce(email_verified,false)=${auth.emailVerified} FOR SHARE
      ), new_trip AS (
        INSERT INTO trips (user_id,island_id,title,start_date,end_date,guest_count,budget,interests,is_ai_generated,is_public)
        SELECT id,${islandId},${itinerary.title},${start.toISOString()}::timestamp,${end.toISOString()}::timestamp,
          ${guestCount},${budget},${JSON.stringify(interests)}::json,true,false FROM actor
        RETURNING id,title
      ), saved_items AS (
        INSERT INTO trip_items (trip_id,listing_id,day_number,time_slot,custom_title,custom_note,sort_order)
        SELECT new_trip.id,item."listingId"::uuid,item."dayNumber",item."timeSlot",item."customTitle",item."customNote",item."sortOrder"
        FROM new_trip CROSS JOIN jsonb_to_recordset(${JSON.stringify(itemValues)}::jsonb)
          AS item("listingId" text,"dayNumber" integer,"timeSlot" text,"customTitle" text,"customNote" text,"sortOrder" integer)
      ) SELECT id,title FROM new_trip
    `);
    const trip = result.rows[0];
    if (!trip) return NextResponse.json({ error: "Your account changed while planning. Sign in again before creating a trip." }, { status: 409 });

    return NextResponse.json({
      trip: {
        id: trip.id,
        title: trip.title,
      },
      itinerary,
    });
  } catch (error) {
    logger.error("Trip planning unavailable", null, { reason: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }
}
