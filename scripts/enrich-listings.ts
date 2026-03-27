/**
 * Enrich Listings Script
 * Fetches Google Places details to add phone, website, hours to unclaimed listings.
 * This data is needed before sending claim invitation emails.
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/enrich-listings.ts
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
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY required");
    process.exit(1);
  }

  const db = drizzle(neon(DATABASE_URL));

  // Get listings with googlePlaceId but no phone/website
  const toEnrich = await db
    .select({
      id: listings.id,
      title: listings.title,
      typeData: listings.typeData,
    })
    .from(listings)
    .where(
      and(
        eq(listings.status, "active"),
        sql`(${listings.typeData}->>'googlePlaceId') IS NOT NULL`,
        sql`(${listings.typeData}->>'phone') IS NULL`,
      )
    )
    .limit(200);

  console.log(`Found ${toEnrich.length} listings to enrich`);
  let enriched = 0;

  for (const listing of toEnrich) {
    const td = listing.typeData as Record<string, unknown>;
    const placeId = td.googlePlaceId as string;

    const details = await getPlaceDetails(placeId);
    if (!details) continue;

    const updatedData = {
      ...td,
      phone: details.formatted_phone_number || null,
      website: details.website || null,
      hours: details.opening_hours?.weekday_text || null,
      googleMapsUrl: details.url || null,
    };

    await db
      .update(listings)
      .set({ typeData: updatedData, updatedAt: new Date() })
      .where(eq(listings.id, listing.id));

    enriched++;
    if (details.website || details.formatted_phone_number) {
      console.log(`✓ ${listing.title} — phone: ${details.formatted_phone_number || "none"}, web: ${details.website || "none"}`);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nEnriched ${enriched} listings with contact details`);
}

main().catch(console.error);
