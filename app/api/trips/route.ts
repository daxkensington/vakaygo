import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { trips, tripItems, listings, islands, media } from "@/drizzle/schema";
import { eq, and, desc, inArray, asc, sql } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";
import { requireUser } from "@/server/admin-auth";

import { logger } from "@/lib/logger";
import { z } from "zod";
import { publicDirectoryListings } from "@/server/public-listing-eligibility";
import { personalItinerary, planningDate, projectLegacyTrip } from "@/server/trip-planner-response";
import { tripSaveQuery, type TripDraftItem } from "@/server/trip-planner-persistence";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function getUser() {
  const auth = await requireUser();
  return auth.ok ? auth.userId : null;
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
    logger.error("Trips GET error", error);
    return NextResponse.json({ error: "Failed to fetch trips" }, { status: 500 });
  }
}

// ─── POST: Create a trip (manual or AI-generated) ──────────────
const createSchema = z.object({
  islandId: z.number().int().positive(), startDate: planningDate, endDate: planningDate,
  title: z.string().trim().min(1).max(256).optional(), guestCount: z.number().int().min(1).max(50).default(1),
  budget: z.string().max(32).optional(), interests: z.array(z.string().max(80)).max(20).optional(),
  generateAI: z.boolean().optional(), itineraryData: z.unknown().optional(),
}).refine(value => { const days = (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000; return days > 0 && days <= 30; });

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a destination, valid dates up to 30 days apart, and valid trip preferences." }, { status: 400 });
    const { islandId, title, startDate, endDate, guestCount, budget, interests, generateAI, itineraryData } = parsed.data;
    const db = getDb();
    const [island] = await db.select({ id: islands.id, name: islands.name, slug: islands.slug }).from(islands).where(and(eq(islands.id, islandId), eq(islands.isActive, true))).limit(1);
    if (!island) return NextResponse.json({ error: "Island not found" }, { status: 404 });
    const start = new Date(startDate), end = new Date(endDate);
    const days = (end.getTime() - start.getTime()) / 86400000;
    const tripTitle = title || island.name + " Trip";
    const save = async (savedTitle: string, isAiGenerated: boolean, items: TripDraftItem[]) => {
      request.signal.throwIfAborted();
      const result = await db.execute(tripSaveQuery(auth, { islandId, title: savedTitle, startDate, endDate, guestCount,
        budget: budget || null, interests: interests || null, isAiGenerated }, items));
      const trip = result.rows[0];
      return trip ? { trip, items: items.map(item => ({ ...item, tripId: trip.id })) } : null;
    };
    const accountChanged = () => NextResponse.json({ error: "Your account changed while planning. Sign in again before creating a trip." }, { status: 409 });

    if (!generateAI && itineraryData == null) {
      const saved = await save(tripTitle, false, []);
      return saved ? NextResponse.json(saved) : accountChanged();
    }

    // This endpoint cannot attest that caller-supplied prose came from our AI.
    // Keep personal notes, but never label them as generated or verified facts.
    if (itineraryData != null) {
      const personal = personalItinerary.safeParse(itineraryData);
      if (!personal.success || personal.data.days.some(day => day.dayNumber > days)) return NextResponse.json({ error: "Invalid personal itinerary." }, { status: 400 });
      const ids = [...new Set(personal.data.days.flatMap(day => day.items.flatMap(item => item.listingId ? [item.listingId] : [])))];
      if (ids.length) {
        const refs = await db.select({ id: listings.id }).from(listings).innerJoin(islands, eq(listings.islandId, islands.id)).where(and(publicDirectoryListings(), inArray(listings.id, ids)));
        const known = new Set(refs.map(row => row.id));
        if (ids.some(id => !known.has(id))) return NextResponse.json({ error: "A selected listing is unavailable." }, { status: 400 });
      }
      const items = personal.data.days.flatMap(day => day.items.map((item, sortOrder) => ({
        listingId: item.listingId ?? null, dayNumber: day.dayNumber, timeSlot: item.timeSlot,
        customTitle: item.title, customNote: item.note ?? null, sortOrder,
      })));
      const saved = await save(personal.data.title || tripTitle, false, items);
      return saved ? NextResponse.json({ ...saved, contentSource: "personal" }) : accountChanged();
    }

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(35000)]);
    const activeListings = await db.select({ id: listings.id, title: listings.title, slug: listings.slug,
      type: listings.type, avgRating: listings.avgRating, reviewCount: listings.reviewCount, islandSlug: islands.slug,
    }).from(listings).innerJoin(islands, eq(listings.islandId, islands.id))
      .where(and(eq(listings.islandId, islandId), publicDirectoryListings()))
      .orderBy(sql`${listings.avgRating} DESC NULLS LAST`, sql`${listings.reviewCount} DESC NULLS LAST`, asc(listings.id))
      .limit(80);
    const listingIds = activeListings.map(row => row.id);
    const imageMap = new Map<string, string>();
    if (listingIds.length) {
      const images = await db.select({ listingId: media.listingId, url: media.url }).from(media)
        .where(and(inArray(media.listingId, listingIds), eq(media.isPrimary, true)));
      images.forEach(img => imageMap.set(img.listingId, getImageUrl(img.url) || img.url));
    }
    let choices: unknown = null;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && activeListings.length) {
      try {
        choices = await whileActive(signal, () => generateWithOpenAI(openaiKey, days, island.name, guestCount,
          budget || "Mid-Range", interests || [], activeListings, signal));
      } catch (error) {
        signal.throwIfAborted();
        logger.error("OpenAI generation failed, falling back to heuristic", null, { reason: error instanceof Error ? error.name : "UnknownError" });
      }
    }
    if (choices === null) choices = generateHeuristic(days, activeListings);
    const known = new Map(activeListings.map(listing => [listing.id, { ...listing, image: imageMap.get(listing.id) ?? null }]));
    const itinerary = projectLegacyTrip(choices, { islandName: island.name, islandSlug: island.slug, startDate, days, listings: known });
    if (!itinerary) return NextResponse.json({ code: "TRIP_PLANNER_UNAVAILABLE", error: "Trip planning is temporarily unavailable. No trip was saved." }, { status: 503 });
    signal.throwIfAborted();
    const items = itinerary.flatMap(day => day.activities.map((item, sortOrder) => ({
      listingId: item.listingId, dayNumber: day.day, timeSlot: item.timeSlot,
      customTitle: item.title, customNote: item.note, sortOrder,
    })));
    const saved = await save(tripTitle, true, items);
    if (!saved) return accountChanged();
    const itemsWithListings = saved.items.map(item => ({ ...item, listing: item.listingId ? {
      ...known.get(item.listingId), priceAmount: null, bookingEligible: false,
    } : null }));
    return NextResponse.json({ trip: saved.trip, items: itemsWithListings });
  } catch (error) {
    logger.error("Trips POST error", null, { reason: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Failed to create trip" }, { status: 500 });
  }
}

async function whileActive<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(
      value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

async function generateWithOpenAI(
  apiKey: string,
  days: number,
  islandName: string,
  guests: number,
  budget: string,
  interests: string[],
  availableListings: { id: string; title: string; type: string; avgRating: string | null }[],
  signal: AbortSignal
) {
  const listingSummary = availableListings
    .map(
      (l) =>
        `- "${l.title}" (type: ${l.type}, rating: ${l.avgRating || "N/A"}) [id: ${l.id}]`
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
      { "timeSlot": "morning", "listingId": "<listing id or null>" },
      { "timeSlot": "afternoon", "listingId": "<listing id or null>" },
      { "timeSlot": "evening", "listingId": "<listing id or null>" }
    ]
  }
]

Rules:
- Use real listing IDs from the list above when they match the activity. Use null for unassigned personal planning slots; never infer free admission.
- Each day must have exactly 3 activities (morning, afternoon, evening).
- Mix different types of experiences across days.
- Prioritize highly-rated listings.
- Return choices only. Do not invent admission, prices, access, reservations or venue hours. Slot labels are suggested planning times only.`;

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
    signal,
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
  availableListings: { id: string; title: string; type: string; avgRating: string | null }[]
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

      activities.push({ timeSlot: slot, listingId: picked?.id ?? null });
    }

    itinerary.push({ day: d, activities });
  }

  return itinerary;
}
