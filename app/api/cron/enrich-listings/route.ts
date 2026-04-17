import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

const BATCH_SIZE = 50;

/**
 * GET — Weekly cron to enrich newly claimed listings.
 * Pulls Google Places data (website, phone, hours, editorial summary)
 * for listings missing this info.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY not set" }, { status: 500 });
  }

  try {
    // Find listings with Google Place IDs that are missing key data
    const listings = await db.execute(sql`
      SELECT l.id, l.title, l.type, l.description,
        l.price_amount as "priceAmount",
        l.type_data as "typeData"
      FROM listings l
      WHERE l.status = 'active'
        AND l.type_data->>'googlePlaceId' IS NOT NULL
        AND (
          l.type_data->>'website' IS NULL
          OR l.type_data->>'phone' IS NULL
          OR l.type_data->>'hours' IS NULL
          OR CHAR_LENGTH(l.description) < 80
        )
      ORDER BY l.updated_at ASC
      LIMIT ${BATCH_SIZE}
    `);

    let enriched = 0;

    for (const listing of listings.rows as any[]) {
      const td = listing.typeData || {};
      const placeId = td.googlePlaceId;
      if (!placeId) continue;

      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,formatted_phone_number,opening_hours,editorial_summary,price_level&key=${GOOGLE_API_KEY}`
        );
        const data = await res.json();
        if (data.status !== "OK") continue;

        const r = data.result;
        const newTd = { ...td };
        let descUpdate = "";
        let priceUpdate = "";

        if (!td.website && r.website) newTd.website = r.website;
        if (!td.phone && r.formatted_phone_number) newTd.phone = r.formatted_phone_number;
        if (r.opening_hours?.weekday_text) newTd.hours = r.opening_hours.weekday_text;

        const newDesc = r.editorial_summary?.overview;
        if (newDesc && newDesc.length > 30 && listing.description.length < 80) {
          descUpdate = newDesc;
        }

        await db.execute(sql`
          UPDATE listings
          SET type_data = ${JSON.stringify(newTd)}::jsonb,
              updated_at = NOW()
              ${descUpdate ? sql`, description = ${descUpdate}` : sql``}
          WHERE id = ${listing.id}::uuid
        `);

        enriched++;
      } catch (err) {
        logger.error("Enrich listing error", { listing: listing.title, err });
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    logger.info("Enrich listings cron complete", { enriched, total: listings.rows.length });
    return NextResponse.json({ ok: true, enriched, total: listings.rows.length });
  } catch (err) {
    logger.error("Enrich listings cron failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
