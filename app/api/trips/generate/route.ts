import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { trips, tripItems, islands } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  searchListings,
  getListingDetails,
  checkAvailability,
} from "@/server/trip-planner-tools";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.id as string;
  } catch {
    return null;
  }
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
          enum: ["stay", "tour", "dining", "event", "excursion", "transport", "transfer"],
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
    const userId = await getUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      islandId,
      startDate,
      endDate,
      guestCount = 2,
      budget = "Mid-Range",
      interests = [],
      pace = "moderate",
      specialRequests = "",
    } = body;

    if (!islandId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "islandId, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get island info
    const [island] = await db
      .select({ id: islands.id, name: islands.name, slug: islands.slug })
      .from(islands)
      .where(eq(islands.id, islandId))
      .limit(1);

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
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[] = [{ role: "user", content: userPrompt }];
    let itineraryData = null;
    const MAX_ITERATIONS = 8;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: CLAUDE_TOOLS,
          messages,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Claude API error:", errorText);
        return NextResponse.json(
          { error: "AI generation failed" },
          { status: 500 }
        );
      }

      const data = await res.json();
      const { content, stop_reason } = data;

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
                console.error("Failed to parse itinerary JSON");
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
          try {
            const result = await handleToolCall(toolUse.name, toolUse.input);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            console.error(`Tool ${toolUse.name} failed:`, err);
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

    if (!itineraryData) {
      return NextResponse.json(
        { error: "Failed to generate itinerary" },
        { status: 500 }
      );
    }

    // Save the trip and items to DB
    const tripTitle =
      itineraryData.title ||
      `${island.name} ${days}-Day Adventure`;

    const [trip] = await db
      .insert(trips)
      .values({
        userId,
        islandId,
        title: tripTitle,
        startDate: start,
        endDate: end,
        guestCount,
        budget,
        interests,
        isAiGenerated: true,
        isPublic: false,
      })
      .returning();

    // Save trip items
    const itemValues: {
      tripId: string;
      listingId: string | null;
      dayNumber: number;
      timeSlot: string;
      customTitle: string;
      customNote: string | null;
      sortOrder: number;
    }[] = [];

    if (itineraryData.days && Array.isArray(itineraryData.days)) {
      for (const day of itineraryData.days) {
        if (day.items && Array.isArray(day.items)) {
          for (let i = 0; i < day.items.length; i++) {
            const item = day.items[i];
            itemValues.push({
              tripId: trip.id,
              listingId: item.listingId || null,
              dayNumber: day.dayNumber,
              timeSlot: item.timeSlot || "morning",
              customTitle: item.title || "Activity",
              customNote: item.note || null,
              sortOrder: i,
            });
          }
        }
      }
    }

    if (itemValues.length > 0) {
      await db.insert(tripItems).values(itemValues);
    }

    return NextResponse.json({
      trip: {
        id: trip.id,
        title: trip.title,
      },
      itinerary: itineraryData,
    });
  } catch (error) {
    console.error("Trip generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate trip" },
      { status: 500 }
    );
  }
}
