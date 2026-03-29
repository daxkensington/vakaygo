/**
 * Fetch Listing Photos from Google Places
 * Pulls real business photos using stored googlePlaceId and saves to media table.
 *
 * Google Places Photos API returns photo_references that we use to construct URLs.
 * Photos are served via Google's CDN — we store the constructed URL.
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/fetch-listing-photos.ts
 * Options:
 *   --limit=100    Process N listings (default 100)
 *   --island=grenada  Only process specific island
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands } from "../drizzle/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 100;
const islandArg = args.find((a) => a.startsWith("--island="));
const islandFilter = islandArg ? islandArg.split("=")[1] : null;

async function getPlacePhotos(placeId: string): Promise<string[]> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" || !data.result?.photos) return [];

  // Get up to 5 photos per listing
  return data.result.photos.slice(0, 5).map((photo: { photo_reference: string }) => {
    // Construct the photo URL — maxwidth=800 for good quality
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${GOOGLE_API_KEY}`;
  });
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY required");
    process.exit(1);
  }

  const db = drizzle(neon(DATABASE_URL));

  // Build conditions
  const conditions = [
    eq(listings.status, "active"),
    sql`(${listings.typeData}->>'googlePlaceId') IS NOT NULL`,
  ];

  if (islandFilter) {
    const [island] = await db
      .select({ id: islands.id })
      .from(islands)
      .where(eq(islands.slug, islandFilter))
      .limit(1);
    if (island) conditions.push(eq(listings.islandId, island.id));
  }

  // Get listings that have googlePlaceId but no media yet
  const listingsToProcess = await db
    .select({
      id: listings.id,
      title: listings.title,
      typeData: listings.typeData,
    })
    .from(listings)
    .leftJoin(media, eq(listings.id, media.listingId))
    .where(and(...conditions, isNull(media.id)))
    .limit(limit);

  console.log(`Found ${listingsToProcess.length} listings needing photos\n`);
  let photosAdded = 0;
  let listingsProcessed = 0;

  for (const listing of listingsToProcess) {
    const td = listing.typeData as Record<string, unknown>;
    const placeId = td?.googlePlaceId as string;
    if (!placeId) continue;

    const photoUrls = await getPlacePhotos(placeId);

    if (photoUrls.length === 0) {
      continue;
    }

    // Insert photos into media table
    for (let i = 0; i < photoUrls.length; i++) {
      await db.insert(media).values({
        listingId: listing.id,
        url: photoUrls[i],
        alt: listing.title,
        type: "image",
        sortOrder: i,
        isPrimary: i === 0,
      });
      photosAdded++;
    }

    listingsProcessed++;
    console.log(`✓ ${listing.title} — ${photoUrls.length} photos`);

    // Rate limit: ~5 requests/sec
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n=== Complete ===`);
  console.log(`Listings processed: ${listingsProcessed}`);
  console.log(`Photos added: ${photosAdded}`);
}

main().catch(console.error);
