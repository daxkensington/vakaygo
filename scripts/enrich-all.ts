/**
 * Enrich ALL listings with Google Places contact details
 * Runs in batches of 200 until no more listings need enrichment
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/enrich-all.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

async function getPlaceDetails(placeId: string) {
  const fields = "formatted_phone_number,website,opening_hours,url";
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.status === "OK" ? data.result : null;
}

async function main() {
  if (!GOOGLE_API_KEY) { console.error("GOOGLE_PLACES_API_KEY required"); process.exit(1); }

  const db = drizzle(neon(DATABASE_URL));
  let totalEnriched = 0;
  let batch = 1;

  while (true) {
    const toEnrich = await db
      .select({ id: listings.id, title: listings.title, typeData: listings.typeData })
      .from(listings)
      .where(and(
        eq(listings.status, "active"),
        sql`(${listings.typeData}->>'googlePlaceId') IS NOT NULL`,
        sql`(${listings.typeData}->>'phone') IS NULL`,
      ))
      .limit(200);

    if (toEnrich.length === 0) {
      console.log("\nAll listings enriched!");
      break;
    }

    console.log(`\n=== Batch ${batch} — ${toEnrich.length} listings ===`);
    let enriched = 0;

    for (const listing of toEnrich) {
      const td = listing.typeData as Record<string, unknown>;
      const placeId = td.googlePlaceId as string;

      const details = await getPlaceDetails(placeId);
      if (!details) {
        // Mark as enriched with empty data so we don't retry
        await db.update(listings).set({
          typeData: { ...td, phone: "", website: "" },
          updatedAt: new Date(),
        }).where(eq(listings.id, listing.id));
        continue;
      }

      await db.update(listings).set({
        typeData: {
          ...td,
          phone: details.formatted_phone_number || "",
          website: details.website || "",
          hours: details.opening_hours?.weekday_text || null,
          googleMapsUrl: details.url || null,
        },
        updatedAt: new Date(),
      }).where(eq(listings.id, listing.id));

      enriched++;
      if (details.phone || details.website) {
        process.stdout.write(".");
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    totalEnriched += enriched;
    batch++;
    console.log(`\n  Enriched: ${enriched}`);
  }

  console.log(`\nTotal enriched: ${totalEnriched}`);
}

main().catch(console.error);
