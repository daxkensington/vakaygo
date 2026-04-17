import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media } from "@/drizzle/schema";
import { eq, and, sql, like } from "drizzle-orm";

import { logger } from "@/lib/logger";
function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

const BATCH_SIZE = 200; // Process 200 listings per cron run

/**
 * GET — Weekly cron to refresh expired Google Places photo references.
 * Google Places photo_references expire after ~30 days.
 * This refreshes the oldest batch each week so all stay current.
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
    // Find listings with Google Places photos that haven't been refreshed recently
    // Order by oldest media creation date so we cycle through all listings
    const staleListings = await db.execute(sql`
      SELECT DISTINCT l.id, l.title, l.type_data->>'googlePlaceId' as place_id
      FROM listings l
      JOIN media m ON m.listing_id = l.id
      WHERE l.status = 'active'
        AND l.type_data->>'googlePlaceId' IS NOT NULL
        AND m.url LIKE '%googleapis.com%'
      ORDER BY l.id
      LIMIT ${BATCH_SIZE}
    `);

    let refreshed = 0;
    let failed = 0;

    for (const listing of staleListings.rows as any[]) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${listing.place_id}&fields=photos&key=${GOOGLE_API_KEY}`
        );
        const data = await res.json();

        if (data.status !== "OK" || !data.result?.photos) {
          failed++;
          continue;
        }

        const photoUrls = data.result.photos.slice(0, 5).map(
          (p: { photo_reference: string }) =>
            `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}`
        );

        // Delete old Google photos
        await db.execute(sql`
          DELETE FROM media
          WHERE listing_id = ${listing.id}::uuid
          AND url LIKE '%googleapis.com%'
        `);

        // Insert fresh ones
        for (let i = 0; i < photoUrls.length; i++) {
          await db.execute(sql`
            INSERT INTO media (listing_id, url, alt, type, sort_order, is_primary)
            VALUES (${listing.id}::uuid, ${photoUrls[i]}, ${listing.title}, 'image', ${i}, ${i === 0})
          `);
        }

        refreshed++;
      } catch (err) {
        failed++;
        logger.error("Photo refresh error", { listing: listing.title, err });
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 200));
    }

    logger.info("Photo refresh cron complete", { refreshed, failed, total: staleListings.rows.length });

    return NextResponse.json({
      ok: true,
      refreshed,
      failed,
      total: staleListings.rows.length,
    });
  } catch (err) {
    logger.error("Photo refresh cron failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
