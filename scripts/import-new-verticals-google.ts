/**
 * Import excursion, transfer, and VIP businesses from Google Places
 * Searches all 21 Caribbean islands with targeted queries
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GKEY = process.env.GOOGLE_PLACES_API_KEY!;

function slugify(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 200); }

const queries = [
  { q: "boat excursion", type: "excursion" as const },
  { q: "catamaran cruise", type: "excursion" as const },
  { q: "snorkeling tour", type: "excursion" as const },
  { q: "island hopping", type: "excursion" as const },
  { q: "fishing charter", type: "excursion" as const },
  { q: "jet ski rental", type: "excursion" as const },
  { q: "parasailing", type: "excursion" as const },
  { q: "sunset cruise", type: "excursion" as const },
  { q: "kayak tour", type: "excursion" as const },
  { q: "adventure tour", type: "excursion" as const },
  { q: "whale watching", type: "excursion" as const },
  { q: "zipline adventure", type: "excursion" as const },
  { q: "airport transfer", type: "transfer" as const },
  { q: "airport shuttle service", type: "transfer" as const },
  { q: "airport taxi service", type: "transfer" as const },
  { q: "private car service", type: "transfer" as const },
  { q: "limousine service", type: "transfer" as const },
  { q: "VIP concierge", type: "vip" as const },
  { q: "private security service", type: "vip" as const },
  { q: "luxury concierge", type: "vip" as const },
];

async function search(query: string, lat: number, lng: number) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=30000&key=${GKEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.status === "OK" ? data.results : [];
}

async function main() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  const allIslands = await db.select().from(islands).where(eq(islands.isActive, true));

  let [op] = await db.select({ id: users.id }).from(users).where(eq(users.email, "unclaimed@vakaygo.com")).limit(1);
  if (!op) {
    [op] = await db.insert(users).values({ email: "unclaimed@vakaygo.com", name: "Unclaimed", role: "operator", businessName: "Unclaimed" }).returning({ id: users.id });
  }

  const seen = new Set<string>();
  let totalImported = 0;

  for (const island of allIslands) {
    const lat = parseFloat(island.latitude || "0");
    const lng = parseFloat(island.longitude || "0");
    if (!lat) continue;

    console.log(`\n=== ${island.name} ===`);
    let count = 0;

    for (const { q, type } of queries) {
      const results = await search(`${q} ${island.name}`, lat, lng);

      for (const place of results) {
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);
        if (place.business_status === "CLOSED_PERMANENTLY") continue;

        const slug = slugify(place.name);
        const existing = await db.select({ id: listings.id }).from(listings).where(eq(listings.slug, slug)).limit(1);
        if (existing.length > 0) continue;

        try {
          await db.insert(listings).values({
            operatorId: op.id,
            islandId: island.id,
            type,
            status: "active",
            title: place.name,
            slug,
            headline: `Discover ${place.name} in ${island.name}`,
            description: `${place.name} is located in ${place.formatted_address || island.name}. Claim this listing for free to add photos and start receiving bookings.`,
            address: place.formatted_address || null,
            latitude: place.geometry?.location?.lat?.toString() || null,
            longitude: place.geometry?.location?.lng?.toString() || null,
            avgRating: (place.rating || 0).toFixed(2),
            reviewCount: place.user_ratings_total || 0,
            typeData: { unclaimed: true, googlePlaceId: place.place_id, source: "google-places" },
            isFeatured: false,
            isInstantBook: type === "transfer",
          });
          count++;
          totalImported++;
        } catch { /* skip */ }

        await new Promise(r => setTimeout(r, 100));
      }
    }
    console.log(`  Imported: ${count}`);
  }

  console.log(`\n=== TOTAL: ${totalImported} ===`);
}

main().catch(console.error);
