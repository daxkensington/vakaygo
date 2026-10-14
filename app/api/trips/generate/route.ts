import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/server/admin-auth";
import { env } from "@/lib/env";
import {
  searchListings,
  getListingDetails,
  checkAvailability,
} from "@/server/trip-planner-tools";

import { logger } from "@/lib/logger";
export const maxDuration = 60;

const UNAVAILABLE = {
  code: "TRIP_PLANNER_UNAVAILABLE",
  error: "Trip planning is temporarily unavailable. Your preferences are kept so you can try again. For help, contact hello@vakaygo.com.",
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
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
const itinerarySchema = z.object({
  title: z.string().trim().min(1).max(256), summary: z.string().max(4000),
  estimatedBudget: z.object({ accommodation: z.number().nonnegative(), activities: z.number().nonnegative(), dining: z.number().nonnegative(), transport: z.number().nonnegative(), total: z.number().nonnegative() }),
  days: z.array(z.object({
    dayNumber: z.number().int().min(1).max(30), date, theme: z.string().max(256),
    items: z.array(z.object({
      timeSlot: z.enum(["morning", "afternoon", "evening"]),
      type: z.enum(["stay", "tour", "dining", "event", "excursion", "transport", "transfer", "guide", "spa", "vip", "free"]),
      title: z.string().trim().min(1).max(256), listingId: z.string().uuid().nullable(),
      listingSlug: z.string().nullable().optional(), listingTitle: z.string().nullable().optional(),
      price: z.number().nonnegative().nullable(), rating: z.number().min(0).max(5).nullable(),
      image: z.string().nullable(), note: z.string().max(4000).nullable(),
    })).max(12),
  })).min(1).max(30),
});

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

const SYSTEM_PROMPT = `You are VakayGo's AI Trip Planner. You create personalized Caribbean itineraries using REAL listings from the VakayGo platform.

For each day of the trip, search for actual listings and build a schedule:
- Morning activity (tour, excursion, or free time)
- Lunch (restaurant recommendation)
- Afternoon activity
- Dinner recommendation
- Evening (event, nightlife, or relaxation)

Match the traveler's budget, interests, and pace. For "relaxed" pace, leave free time. For "active" pace, fill every slot.

Budget guide (per person per day):
- Budget: under $100/day
- Mid-range: $100-250/day
- Luxury: $250+/day

Always search for real listings first. Never make up fictional places. If no listings match, suggest "free time" or "explore on your own" for that slot.

IMPORTANT: You MUST call tools to search for listings. Do NOT generate listing IDs from memory. Start by searching for stays, then tours/excursions, then dining, then events/transfers as needed.

Return your itinerary as structured JSON matching this exact format:
{
  "title": "descriptive trip title",
  "summary": "2-3 sentence trip summary",
  "estimatedBudget": { "accommodation": 0, "activities": 0, "dining": 0, "transport": 0, "total": 0 },
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "theme": "Day theme",
      "items": [
        {
          "timeSlot": "morning|afternoon|evening",
          "type": "stay|tour|dining|event|excursion|transport|transfer|free",
          "title": "Activity title",
          "listingId": "uuid or null for free activities",
          "listingSlug": "slug or null",
          "listingTitle": "Original listing title or null",
          "price": 0,
          "rating": 0,
          "image": "url or null",
          "note": "Brief description/tip"
        }
      ]
    }
  ]
}`;

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
      .where(eq(islands.id, islandId))
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
    let itineraryData = null;
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
              for (const listing of result) knownListings.set(listing.id, listing);
            } else if (toolUse.name === "get_listing_details" && result && "id" in result) {
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

    const validated = itinerarySchema.safeParse(itineraryData);
    if (!validated.success) return NextResponse.json(UNAVAILABLE, { status: 503 });
    const itinerary = validated.data;
    if (itinerary.days.length !== days || itinerary.days.some((day, index) =>
      day.dayNumber !== index + 1 || day.date !== new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10)
    )) return NextResponse.json(UNAVAILABLE, { status: 503 });

    const itemValues: {
      listingId: string | null;
      dayNumber: number;
      timeSlot: string;
      customTitle: string;
      customNote: string | null;
      sortOrder: number;
    }[] = [];

      for (const day of itinerary.days) {
          for (let i = 0; i < day.items.length; i++) {
            const item = day.items[i];
            if (item.listingId) {
              const listing = knownListings.get(item.listingId);
              if (!listing || listing.islandSlug !== island.slug || listing.type !== item.type) return NextResponse.json(UNAVAILABLE, { status: 503 });
              // Listing links and facts come from the catalog, never model text.
              item.listingSlug = listing.slug;
              item.listingTitle = listing.title;
              item.image = listing.image;
              item.rating = listing.avgRating === null ? null : Number(listing.avgRating);
              item.price = listing.bookingEligible && listing.priceAmount !== null ? Number(listing.priceAmount) : null;
            } else if (item.type !== "free") {
              return NextResponse.json(UNAVAILABLE, { status: 503 });
            } else {
              item.listingSlug = null;
              item.listingTitle = null;
              item.image = null;
              item.price = 0;
              item.rating = null;
            }
            itemValues.push({
              listingId: item.listingId || null,
              dayNumber: day.dayNumber,
              timeSlot: item.timeSlot || "morning",
              customTitle: item.title || "Activity",
              customNote: item.note || null,
              sortOrder: i,
            });
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
