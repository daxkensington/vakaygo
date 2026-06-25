import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MIN_BYTES = 2_000;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * One-off batch migration of `media.url` Google Places photo links into
 * Vercel Blob. Same logic as scripts/migrate-google-photos-to-blob.ts but
 * runs on Vercel infra so it can't be killed by a local shell timeout.
 *
 * Authorize with the cron secret (so only operators can trigger it).
 * Each call processes up to ?limit=N rows (default 500). Caller polls
 * until the response reports remaining=0.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed if the secret is unset (avoid a `Bearer undefined` bypass).
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "500", 10), 2000);
  const concurrency = Math.min(parseInt(url.searchParams.get("concurrency") ?? "8", 10), 16);

  const DATABASE_URL = process.env.DATABASE_URL;
  const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
  const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

  if (!DATABASE_URL || !BLOB_TOKEN || !GOOGLE_API_KEY) {
    return NextResponse.json({ error: "Missing env" }, { status: 500 });
  }

  const sql = neon(DATABASE_URL);

  const rows = (await sql`
    SELECT id::text AS id, listing_id::text AS listing_id, url
    FROM media
    WHERE url LIKE '%googleapis.com%'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as unknown as Array<{ id: string; listing_id: string; url: string }>;

  let migrated = 0;
  let failed = 0;
  let bytesUploaded = 0;

  const t0 = Date.now();

  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < rows.length) {
        const row = rows[i++];
        if (!row.url.includes("googleapis.com/maps/api/place/photo")) continue;

        const sep = row.url.includes("?") ? "&" : "?";
        const fetchUrl = row.url.includes("key=")
          ? row.url
          : `${row.url}${sep}key=${GOOGLE_API_KEY}`;

        try {
          const res = await fetch(fetchUrl, { redirect: "follow" });
          if (!res.ok) {
            failed++;
            continue;
          }
          const ct = res.headers.get("content-type") ?? "image/jpeg";
          if (!ct.startsWith("image/")) {
            failed++;
            continue;
          }
          const buf = await res.arrayBuffer();
          if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES) {
            failed++;
            continue;
          }
          const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
          const blob = await put(`places/${row.id}.${ext}`, buf, {
            access: "public",
            contentType: ct,
            addRandomSuffix: false,
            allowOverwrite: true,
            token: BLOB_TOKEN,
          });
          await sql`UPDATE media SET url = ${blob.url} WHERE id = ${row.id}::uuid`;
          migrated++;
          bytesUploaded += buf.byteLength;
        } catch (err: any) {
          failed++;
          logger.warn("migrate-photos error", { id: row.id, msg: err?.message });
        }
      }
    }),
  );

  const remaining = (await sql`
    SELECT COUNT(*)::int AS n FROM media WHERE url LIKE ${"%googleapis.com%"}
  `) as unknown as Array<{ n: number }>;

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - t0,
    migrated,
    failed,
    bytes_uploaded: bytesUploaded,
    remaining: remaining[0].n,
  });
}
