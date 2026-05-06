import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { put } from "@vercel/blob";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

const BATCH_SIZE = 200;
const MIN_BYTES = 2_000;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Weekly cron — keep Google Places photos fresh and ON OUR DOMAIN.
 *
 * Old behavior (pre-2026-05-05) stored `maps.googleapis.com/.../photo?...`
 * URLs in `media.url` and proxied them at request time. Every cache miss
 * billed Google ~$7/1000 photo fetches, which compounded as SEO traffic
 * grew.
 *
 * New behavior: download fresh photos to Vercel Blob, store the Blob URL.
 * Google billing is then bounded by the cron rate (200 listings/week ×
 * up-to-5 photos), not by site traffic.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY not set" }, { status: 500 });
  }
  if (!BLOB_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not set" }, { status: 500 });
  }

  // Find listings that still have direct googleapis.com photo URLs (i.e.
  // not yet migrated to Blob), oldest first so we cycle through every one.
  const stale = await db.execute(sql`
    SELECT DISTINCT l.id::text AS id, l.title, l.type_data->>'googlePlaceId' AS place_id
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
  let photosUploaded = 0;

  for (const listing of stale.rows as Array<{ id: string; title: string; place_id: string }>) {
    try {
      const detailsRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${listing.place_id}&fields=photos&key=${GOOGLE_API_KEY}`,
      );
      const data = await detailsRes.json();

      if (data.status !== "OK" || !data.result?.photos) {
        failed++;
        continue;
      }

      const photoRefs: string[] = data.result.photos
        .slice(0, 5)
        .map((p: { photo_reference: string }) => p.photo_reference);

      const blobUrls: string[] = [];
      for (const ref of photoRefs) {
        const photoRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${GOOGLE_API_KEY}`,
          { redirect: "follow" },
        );
        if (!photoRes.ok) continue;
        const ct = photoRes.headers.get("content-type") ?? "image/jpeg";
        if (!ct.startsWith("image/")) continue;
        const buf = await photoRes.arrayBuffer();
        if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES) continue;

        const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
        const key = `places/${listing.id}-${blobUrls.length}.${ext}`;
        const blob = await put(key, buf, {
          access: "public",
          contentType: ct,
          addRandomSuffix: false,
          allowOverwrite: true,
          token: BLOB_TOKEN,
        });
        blobUrls.push(blob.url);
        photosUploaded++;
      }

      if (blobUrls.length === 0) {
        failed++;
        continue;
      }

      await db.execute(sql`
        DELETE FROM media
        WHERE listing_id = ${listing.id}::uuid
          AND url LIKE '%googleapis.com%'
      `);

      for (let i = 0; i < blobUrls.length; i++) {
        await db.execute(sql`
          INSERT INTO media (listing_id, url, alt, type, sort_order, is_primary)
          VALUES (${listing.id}::uuid, ${blobUrls[i]}, ${listing.title}, 'image', ${i}, ${i === 0})
        `);
      }

      refreshed++;
    } catch (err) {
      failed++;
      logger.error("Photo refresh error", { listing: listing.title, err });
    }

    // Gentle pacing so we don't hit Places per-second quotas.
    await new Promise((r) => setTimeout(r, 200));
  }

  logger.info("Photo refresh cron complete", {
    refreshed,
    failed,
    photosUploaded,
    total: stale.rows.length,
  });

  return NextResponse.json({
    ok: true,
    refreshed,
    failed,
    photosUploaded,
    total: stale.rows.length,
  });
}
