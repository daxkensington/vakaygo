import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { trips, tripItems, listings, islands, media } from "@/drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

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

// ─── GET: Fetch user's trips ───────────────────────────────────
export async function GET() {
  try {
    const userId = await getUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const results = await db
      .select({
        id: trips.id,
        title: trips.title,
        islandId: trips.islandId,
        islandName: islands.name,
        islandSlug: islands.slug,
        startDate: trips.startDate,
        endDate: trips.endDate,
        guestCount: trips.guestCount,
        budget: trips.budget,
        interests: trips.interests,
        isAiGenerated: trips.isAiGenerated,
        isPublic: trips.isPublic,
        createdAt: trips.createdAt,
      })
      .from(trips)
      .leftJoin(islands, eq(trips.islandId, islands.id))
      .where(eq(trips.userId, userId))
      .orderBy(desc(trips.createdAt));

    // Get item counts for each trip
    const tripIds = results.map((t) => t.id);
    const itemCounts = new Map<string, number>();

    if (tripIds.length > 0) {
      const items = await db
        .select({ tripId: tripItems.tripId, id: tripItems.id })
        .from(tripItems)
        .where(inArray(tripItems.tripId, tripIds));

      for (const item of items) {
        itemCounts.set(item.tripId, (itemCounts.get(item.tripId) || 0) + 1);
      }
    }

    const tripsWithCounts = results.map((t) => ({
      ...t,
      itemCount: itemCounts.get(t.id) || 0,
    }));

    return NextResponse.json({ trips: tripsWithCounts });
  } catch (error) {
    console.error("Trips GET error:", error);
    return NextResponse.json({ error: "Failed to fetch trips" }, { status: 500 });
  }
}

// ─── POST: Create a trip (manual or AI-generated) ──────────────
export async function POST(request: Request) {
  try {
    const userId = await getUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      islandId,
      title,
      startDate,
      endDate,
      guestCount = 1,
      budget,
      interests,
      generateAI,
    } = body;

    if (!islandId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "islandId, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get island name
    const [island] = await db
      .select({ id: islands.id, name: islands.name })
      .from(islands)
      .where(eq(islands.id, islandId))
      .limit(1);

    if (!island) {
      return NextResponse.json({ error: "Island not found" }, { status: 404 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    const tripTitle = title || `${island.name} Trip`;

    if (!generateAI) {
      // Manual mode: just create the trip shell
      const [trip] = await db
        .insert(trips)
        .values({
          userId,
          islandId,
          title: tripTitle,
          startDate: start,
          endDate: end,
          guestCount,
          budget: budget || null,
          interests: interests || null,
          isAiGenerated: false,
          isPublic: false,
        })
        .returning();

      return NextResponse.json({ trip, items: [] });
    }

    // ─── AI-generated mode ─────────────────────────────────────
    // Fetch active listings for the island
    const activeListings = await db
      .select({
        id: listings.id,
        title: listings.title,
        type: listings.type,
        priceAmount: listings.priceAmount,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        headline: listings.headline,
      })
      .from(listings)
      .where(and(eq(listings.islandId, islandId), eq(listings.status, "active")));

    // Get primary images
    const listingIds = activeListings.map((l) => l.id);
    const imageMap = new Map<string, string>();
    if (listingIds.length > 0) {
      const images = await db
        .select({ listingId: media.listingId, url: media.url })
        .from(media)
        .where(and(inArray(media.listingId, listingIds), eq(media.isPrimary, true)));
      images.forEach((img) => imageMap.set(img.listingId, img.url));
    }

    type ItineraryDay = {
      day: number;
      activities: { timeSlot: string; listingId: string | null; title: string; note: string }[];
    };

    let itinerary: ItineraryDay[] = [];

    // Try OpenAI first
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && activeListings.length > 0) {
      try {
        itinerary = await generateWithOpenAI(
          openaiKey,
          days,
          island.name,
          guestCount,
          budget || "Mid-Range",
          interests || [],
          activeListings
        );
      } catch (e) {
        console.error("OpenAI generation failed, falling back to heuristic:", e);
      }
    }

    // Fallback: smart heuristic
    if (itinerary.length === 0) {
      itinerary = generateHeuristic(days, activeListings, interests || []);
    }

    // Create the trip
    const [trip] = await db
      .insert(trips)
      .values({
        userId,
        islandId,
        title: tripTitle,
        startDate: start,
        endDate: end,
        guestCount,
        budget: budget || null,
        interests: interests || null,
        isAiGenerated: true,
        isPublic: false,
      })
      .returning();

    // Create trip items
    const itemValues: {
      tripId: string;
      listingId: string | null;
      dayNumber: number;
      timeSlot: string;
      customTitle: string;
      customNote: string | null;
      sortOrder: number;
    }[] = [];

    for (const day of itinerary) {
      for (let i = 0; i < day.activities.length; i++) {
        const act = day.activities[i];
        itemValues.push({
          tripId: trip.id,
          listingId: act.listingId || null,
          dayNumber: day.day,
          timeSlot: act.timeSlot,
          customTitle: act.title,
          customNote: act.note || null,
          sortOrder: i,
        });
      }
    }

    if (itemValues.length > 0) {
      await db
        .insert(tripItems)
        .values(itemValues);
    }

    // Attach listing info to items
    const listingMap = new Map(activeListings.map((l) => [l.id, l]));
    const itemsWithListings = itemValues.map((item) => ({
      ...item,
      listing: item.listingId ? {
        ...listingMap.get(item.listingId),
        image: item.listingId ? imageMap.get(item.listingId) || null : null,
      } : null,
    }));

    return NextResponse.json({ trip, items: itemsWithListings });
  } catch (error) {
    console.error("Trips POST error:", error);
    return NextResponse.json({ error: "Failed to create trip" }, { status: 500 });
  }
}

// ─── OpenAI generation ─────────────────────────────────────────
async function generateWithOpenAI(
  apiKey: string,
  days: number,
  islandName: string,
  guests: number,
  budget: string,
  interests: string[],
  availableListings: { id: string; title: string; type: string; priceAmount: string | null; avgRating: string | null }[]
) {
  const listingSummary = availableListings
    .map(
      (l) =>
        `- "${l.title}" (type: ${l.type}, price: $${l.priceAmount || "N/A"}, rating: ${l.avgRating || "N/A"}) [id: ${l.id}]`
    )
    .join("\n");

  const prompt = `Create a ${days}-day trip itinerary for ${islandName} for ${guests} guest(s) with a ${budget} budget.
Interests: ${interests.join(", ") || "General"}.

Available listings:
${listingSummary}

Return ONLY valid JSON — no markdown, no code fences. The format must be:
[
  {
    "day": 1,
    "activities": [
      { "timeSlot": "morning", "listingId": "<listing id or null>", "title": "<activity title>", "note": "<brief description>" },
      { "timeSlot": "afternoon", "listingId": "<listing id or null>", "title": "<activity title>", "note": "<brief description>" },
      { "timeSlot": "evening", "listingId": "<listing id or null>", "title": "<activity title>", "note": "<brief description>" }
    ]
  }
]

Rules:
- Use real listing IDs from the list above when they match the activity. Use null for free/custom activities.
- Each day must have exactly 3 activities (morning, afternoon, evening).
- Mix different types of experiences across days.
- Prioritize highly-rated listings.
- Keep budget in mind when selecting listings.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a travel itinerary planner. Respond only with valid JSON arrays.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "[]";
  // Strip potential markdown code fences
  const cleaned = content.replace(/^```(?:json)?\n?/g, "").replace(/\n?```$/g, "");
  return JSON.parse(cleaned);
}

// ─── Heuristic fallback ────────────────────────────────────────
function generateHeuristic(
  days: number,
  availableListings: { id: string; title: string; type: string; priceAmount: string | null; avgRating: string | null }[],
  interests: string[]
) {
  const timeSlots = ["morning", "afternoon", "evening"];

  // Categorize by type
  const byType: Record<string, typeof availableListings> = {};
  for (const l of availableListings) {
    if (!byType[l.type]) byType[l.type] = [];
    byType[l.type].push(l);
  }

  // Sort each bucket by rating desc
  for (const type of Object.keys(byType)) {
    byType[type].sort(
      (a, b) => parseFloat(b.avgRating || "0") - parseFloat(a.avgRating || "0")
    );
  }

  // Preferred mappings
  const slotPreference: Record<string, string[]> = {
    morning: ["tour", "excursion", "guide", "transport"],
    afternoon: ["dining", "tour", "excursion", "guide"],
    evening: ["event", "dining", "vip", "tour"],
  };

  const used = new Set<string>();
  const itinerary = [];

  for (let d = 1; d <= days; d++) {
    const activities = [];

    for (const slot of timeSlots) {
      const preferred = slotPreference[slot] || [];
      let picked = null;

      // Try to pick from preferred types
      for (const pType of preferred) {
        const bucket = byType[pType] || [];
        const available = bucket.find((l) => !used.has(l.id));
        if (available) {
          picked = available;
          used.add(available.id);
          break;
        }
      }

      // Fallback to any unused listing
      if (!picked) {
        for (const l of availableListings) {
          if (!used.has(l.id)) {
            picked = l;
            used.add(l.id);
            break;
          }
        }
      }

      if (picked) {
        activities.push({
          timeSlot: slot,
          listingId: picked.id,
          title: picked.title,
          note: `Enjoy this ${picked.type} experience${picked.priceAmount ? ` (~$${picked.priceAmount})` : ""}.`,
        });
      } else {
        // Free activity when we run out of listings
        const freeActivities: Record<string, { title: string; note: string }> = {
          morning: { title: "Beach Morning", note: "Start the day with a relaxing walk on the beach." },
          afternoon: { title: "Explore Local Area", note: "Wander the streets and discover hidden gems." },
          evening: { title: "Sunset Viewing", note: "Find a scenic spot and enjoy the Caribbean sunset." },
        };
        const free = freeActivities[slot] || freeActivities.morning;
        activities.push({
          timeSlot: slot,
          listingId: null,
          title: free.title,
          note: free.note,
        });
      }
    }

    itinerary.push({ day: d, activities });
  }

  return itinerary;
}
