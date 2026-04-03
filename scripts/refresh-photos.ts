/**
 * Refresh expired Google Places photo references
 * Re-fetches photo_references from Places API for all listings with stale URLs.
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/refresh-photos.ts
 * Options:
 *   --limit=500    Process N listings per run (default 500)
 *   --island=grenada  Only process specific island
 *   --dry-run      Show what would be updated without making changes
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands } from "../drizzle/schema";
import { eq, and, sql, like } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 500;
const islandArg = args.find((a) => a.startsWith("--island="));
const islandFilter = islandArg ? islandArg.split("=")[1] : null;
const dryRun = args.includes("--dry-run");

async function getPlacePhotos(placeId: string): Promise<string[]> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" || !data.result?.photos) return [];

  return data.result.photos.slice(0, 5).map((photo: { photo_reference: string }) => {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}`;
  });
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY required");
    process.exit(1);
  }

  const db = drizzle(neon(DATABASE_URL));

  // Find listings with Google Places photos (these need refreshing)
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

  const listingsToRefresh = await db
    .select({
      id: listings.id,
      title: listings.title,
      typeData: listings.typeData,
    })
    .from(listings)
    .where(and(...conditions))
    .limit(limit);

  console.log(`Found ${listingsToRefresh.length} listings to refresh photos\n`);
  if (dryRun) console.log("=== DRY RUN ===\n");

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const listing of listingsToRefresh) {
    const td = listing.typeData as Record<string, unknown>;
    const placeId = td?.googlePlaceId as string;
    if (!placeId) { skipped++; continue; }

    try {
      const photoUrls = await getPlacePhotos(placeId);

      if (photoUrls.length === 0) {
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY] ${listing.title} — ${photoUrls.length} photos`);
        refreshed++;
        continue;
      }

      // Delete old Google Places media for this listing (keep non-Google images)
      await db.delete(media).where(
        and(
          eq(media.listingId, listing.id),
          like(media.url, "%googleapis.com%")
        )
      );

      // Insert fresh photos
      for (let i = 0; i < photoUrls.length; i++) {
        await db.insert(media).values({
          listingId: listing.id,
          url: photoUrls[i],
          alt: listing.title,
          type: "image",
          sortOrder: i,
          isPrimary: i === 0,
        });
      }

      refreshed++;
      if (refreshed % 50 === 0) {
        console.log(`Progress: ${refreshed}/${listingsToRefresh.length}`);
      }
    } catch (err) {
      failed++;
      console.error(`✗ ${listing.title}: ${err}`);
    }

    // Rate limit: ~3 requests/sec (Places Details API has stricter limits)
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\n=== Complete ===`);
  console.log(`Refreshed: ${refreshed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch(console.error);
