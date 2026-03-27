/**
 * Caribbean-Wide Google Places Import
 * Runs Google Places searches for every island in the database.
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/import-caribbean-google.ts
 *
 * Optional: Pass island slug to import single island:
 *   npx tsx scripts/import-caribbean-google.ts barbados
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq, ne } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

const TYPE_MAP: Record<string, { type: string }> = {
  lodging: { type: "stay" }, hotel: { type: "stay" }, resort: { type: "stay" },
  guest_house: { type: "stay" }, restaurant: { type: "dining" },
  cafe: { type: "dining" }, bar: { type: "dining" }, night_club: { type: "event" },
  travel_agency: { type: "tour" }, car_rental: { type: "transport" },
  taxi_stand: { type: "transport" }, tourist_attraction: { type: "tour" },
  museum: { type: "tour" }, spa: { type: "tour" }, food: { type: "dining" },
};

function getSearchQueries(islandName: string): string[] {
  return [
    `hotels in ${islandName}`,
    `resorts in ${islandName}`,
    `restaurants in ${islandName}`,
    `tours in ${islandName}`,
    `diving ${islandName}`,
    `snorkeling ${islandName}`,
    `sailing ${islandName}`,
    `car rental ${islandName}`,
    `bars ${islandName}`,
    `cafe ${islandName}`,
    `spa ${islandName}`,
    `attractions ${islandName}`,
    `beach bar ${islandName}`,
    `nightlife ${islandName}`,
    `things to do ${islandName}`,
    `excursions ${islandName}`,
  ];
}

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 200);
}

function determineType(types: string[]): string {
  for (const t of types) {
    if (TYPE_MAP[t]) return TYPE_MAP[t].type;
  }
  if (types.includes("point_of_interest")) return "tour";
  return "tour";
}

async function searchPlaces(query: string, lat: number, lng: number) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=30000&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(`  Error: ${data.status} — ${data.error_message || ""}`);
    return [];
  }
  return data.results || [];
}

async function importIsland(
  db: ReturnType<typeof drizzle>,
  island: { id: number; slug: string; name: string; latitude: string | null; longitude: string | null },
  operatorId: string
) {
  const lat = parseFloat(island.latitude || "0");
  const lng = parseFloat(island.longitude || "0");
  const queries = getSearchQueries(island.name);
  const seen = new Set<string>();
  let imported = 0;

  for (const query of queries) {
    console.log(`  Searching: "${query}"...`);
    const results = await searchPlaces(query, lat, lng);

    for (const place of results) {
      if (seen.has(place.place_id)) continue;
      seen.add(place.place_id);

      if (place.business_status === "CLOSED_PERMANENTLY") continue;

      const type = determineType(place.types || []);
      const slug = slugify(place.name);

      // Check existing
      const existing = await db.select({ id: listings.id }).from(listings).where(eq(listings.slug, slug)).limit(1);
      if (existing.length > 0) continue;

      try {
        await db.insert(listings).values({
          operatorId,
          islandId: island.id,
          type: type as "stay" | "tour" | "dining" | "event" | "transport" | "guide",
          status: "active",
          title: place.name,
          slug,
          headline: `Discover ${place.name} in ${island.name}`,
          description: `${place.name} is located in ${place.formatted_address || island.name}. This listing was created from public data — the business owner can claim it for free.`,
          address: place.formatted_address || null,
          latitude: place.geometry?.location?.lat?.toString() || null,
          longitude: place.geometry?.location?.lng?.toString() || null,
          avgRating: place.rating?.toFixed(2) || "0.00",
          reviewCount: place.user_ratings_total || 0,
          typeData: {
            unclaimed: true,
            googlePlaceId: place.place_id,
            googleTypes: place.types,
            source: "google-places",
          },
          isFeatured: false,
          isInstantBook: false,
        });
        imported++;
      } catch {
        // Skip on conflict
      }

      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { imported, found: seen.size };
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY required");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);
  const targetSlug = process.argv[2];

  // Get islands (skip Grenada if already imported)
  let islandRows;
  if (targetSlug) {
    islandRows = await db.select().from(islands).where(eq(islands.slug, targetSlug));
  } else {
    islandRows = await db.select().from(islands).where(ne(islands.slug, "grenada"));
  }

  if (islandRows.length === 0) {
    console.error("No islands found");
    process.exit(1);
  }

  // Get/create unclaimed operator
  let [op] = await db.select({ id: users.id }).from(users).where(eq(users.email, "unclaimed@vakaygo.com")).limit(1);
  if (!op) {
    [op] = await db.insert(users).values({
      email: "unclaimed@vakaygo.com", name: "Unclaimed Listing", role: "operator",
      businessName: "Unclaimed — Claim Your Business",
    }).returning({ id: users.id });
  }

  let totalImported = 0;

  for (const island of islandRows) {
    console.log(`\n=== ${island.name} ===`);
    const { imported, found } = await importIsland(db, island, op.id);
    totalImported += imported;
    console.log(`  Result: ${imported} imported, ${found} found`);
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Total imported: ${totalImported}`);
  console.log(`Islands processed: ${islandRows.length}`);
}

main().catch(console.error);
