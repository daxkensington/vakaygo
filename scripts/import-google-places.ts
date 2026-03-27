/**
 * Google Places Import Script
 * Searches for tourism businesses in Grenada and creates unclaimed listing stubs.
 * Uses only publicly available data (name, address, phone, hours, rating, category).
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/import-google-places.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

// Grenada center coordinates
const GRENADA_LAT = 12.1165;
const GRENADA_LNG = -61.679;
const SEARCH_RADIUS = 25000; // 25km covers the whole island

// Map Google place types to VakayGo listing types
const TYPE_MAP: Record<string, { type: string; category: string }> = {
  lodging: { type: "stay", category: "Hotel" },
  hotel: { type: "stay", category: "Hotel" },
  resort: { type: "stay", category: "Hotel" },
  guest_house: { type: "stay", category: "Guesthouse" },
  restaurant: { type: "dining", category: "Restaurant" },
  cafe: { type: "dining", category: "Cafe" },
  bar: { type: "dining", category: "Bar" },
  night_club: { type: "event", category: "Nightlife" },
  travel_agency: { type: "tour", category: "Tour Operator" },
  car_rental: { type: "transport", category: "Car Rental" },
  taxi_stand: { type: "transport", category: "Taxi" },
  tourist_attraction: { type: "tour", category: "Attraction" },
  museum: { type: "tour", category: "Museum" },
  spa: { type: "tour", category: "Spa & Wellness" },
};

// Search queries to cover all business types
const SEARCH_QUERIES = [
  "hotels in grenada",
  "restaurants in grenada",
  "tours in grenada",
  "diving grenada",
  "snorkeling grenada",
  "sailing grenada",
  "car rental grenada",
  "taxi grenada",
  "bars grenada",
  "cafe grenada",
  "spa grenada",
  "attractions grenada",
  "guesthouse grenada",
  "villa rental grenada",
  "nightlife grenada",
  "beach bar grenada",
  "food tour grenada",
  "hiking grenada",
  "waterfall grenada",
  "rum distillery grenada",
  "chocolate grenada",
  "spice tour grenada",
  "fishing grenada",
  "kayak grenada",
  "yoga grenada",
];

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  geometry?: {
    location: { lat: number; lng: number };
  };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
  formatted_phone_number?: string;
  website?: string;
  photos?: { photo_reference: string }[];
  business_status?: string;
}

async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${GRENADA_LAT},${GRENADA_LNG}&radius=${SEARCH_RADIUS}&key=${GOOGLE_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(`Search failed for "${query}":`, data.status, data.error_message);
    return [];
  }

  return data.results || [];
}

async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const fields = "name,formatted_address,geometry,rating,user_ratings_total,types,opening_hours,formatted_phone_number,website,photos,business_status";
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK") {
    return null;
  }

  return data.result;
}

function determineListingType(types: string[]): { type: string; category: string } | null {
  for (const t of types) {
    if (TYPE_MAP[t]) return TYPE_MAP[t];
  }
  // Default mappings
  if (types.includes("food")) return { type: "dining", category: "Restaurant" };
  if (types.includes("point_of_interest") && types.includes("establishment")) {
    return { type: "tour", category: "Attraction" };
  }
  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 200);
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY is required");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  // Get or create Grenada island
  let [grenada] = await db
    .select({ id: islands.id })
    .from(islands)
    .where(eq(islands.slug, "grenada"))
    .limit(1);

  if (!grenada) {
    [grenada] = await db
      .insert(islands)
      .values({
        slug: "grenada",
        name: "Grenada",
        country: "Grenada",
        region: "Caribbean",
        isActive: true,
        currency: "XCD",
        timezone: "America/Grenada",
        latitude: "12.1165",
        longitude: "-61.6790",
      })
      .returning({ id: islands.id });
  }

  // Get or create unclaimed operator account
  let [unclaimedOperator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "unclaimed@vakaygo.com"))
    .limit(1);

  if (!unclaimedOperator) {
    [unclaimedOperator] = await db
      .insert(users)
      .values({
        email: "unclaimed@vakaygo.com",
        name: "Unclaimed Listing",
        role: "operator",
        businessName: "Unclaimed — Claim Your Business",
        islandId: grenada.id,
        onboardingComplete: false,
        emailVerified: false,
      })
      .returning({ id: users.id });
  }

  const seen = new Set<string>();
  let imported = 0;
  let skipped = 0;

  for (const query of SEARCH_QUERIES) {
    console.log(`\nSearching: "${query}"...`);
    const results = await searchPlaces(query);
    console.log(`  Found ${results.length} results`);

    for (const place of results) {
      if (seen.has(place.place_id)) {
        skipped++;
        continue;
      }
      seen.add(place.place_id);

      // Skip if not in Grenada
      if (
        place.formatted_address &&
        !place.formatted_address.toLowerCase().includes("grenada")
      ) {
        continue;
      }

      // Skip permanently closed
      if (place.business_status === "CLOSED_PERMANENTLY") {
        continue;
      }

      const typeInfo = determineListingType(place.types || []);
      if (!typeInfo) continue;

      const slug = slugify(place.name);

      // Check if listing already exists
      const existing = await db
        .select({ id: listings.id })
        .from(listings)
        .where(eq(listings.slug, slug))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Get details for more info
      const details = await getPlaceDetails(place.place_id);

      const listingData = {
        operatorId: unclaimedOperator.id,
        islandId: grenada.id,
        type: typeInfo.type as "stay" | "tour" | "dining" | "event" | "transport" | "guide",
        status: "active" as const,
        title: place.name,
        slug,
        headline: `Discover ${place.name} in Grenada`,
        description: `${place.name} is located in ${place.formatted_address || "Grenada"}. This listing was created from public data — the business owner can claim it for free to add photos, pricing, and availability.`,
        address: place.formatted_address || null,
        latitude: place.geometry?.location.lat?.toString() || null,
        longitude: place.geometry?.location.lng?.toString() || null,
        avgRating: place.rating?.toFixed(2) || "0.00",
        reviewCount: place.user_ratings_total || 0,
        typeData: {
          googlePlaceId: place.place_id,
          unclaimed: true,
          phone: details?.formatted_phone_number || null,
          website: details?.website || null,
          hours: details?.opening_hours?.weekday_text || null,
          googleTypes: place.types,
          category: typeInfo.category,
        },
        isFeatured: false,
        isInstantBook: false,
      };

      try {
        await db.insert(listings).values(listingData).onConflictDoNothing();
        imported++;
        console.log(`  ✓ ${place.name} (${typeInfo.type})`);
      } catch (err) {
        console.error(`  ✗ Failed: ${place.name}`, err);
      }

      // Rate limit — Google allows 10 QPS
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (duplicates): ${skipped}`);
  console.log(`Total unique places found: ${seen.size}`);
}

main().catch(console.error);
