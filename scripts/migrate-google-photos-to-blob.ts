/**
 * One-off migration: download every Google Places photo currently stored as
 * a `maps.googleapis.com/.../place/photo?...` URL in `media.url`, upload it
 * to Vercel Blob, and rewrite the row to point at the Blob URL.
 *
 * After this runs, serving images costs nothing — no API key, no per-view
 * Place Photos billing. The expensive `/api/images/proxy` round-trip is
 * skipped entirely because `lib/image-utils.ts` only proxies googleapis.com
 * URLs.
 *
 * Flags:
 *   --limit=N          stop after N media rows (default: all)
 *   --concurrency=N    parallel fetches (default: 4)
 *   --dry-run          fetch + upload nothing; just print what would happen
 *
 * Safety:
 *   - Idempotent: blob key is `places/<media_id>.jpg`. Re-uploading
 *     overwrites the same key, and the DB UPDATE is by primary key.
 *   - Skips rows whose URL is already a non-googleapis host.
 *   - On 4xx/5xx from Google, leaves the row alone so the weekly cron can
 *     pick it up after refreshing the photo_reference.
 */
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const LIMIT = args.has("limit") ? parseInt(args.get("limit")!, 10) : Infinity;
const CONCURRENCY = parseInt(args.get("concurrency") ?? "4", 10);
const DRY_RUN = args.get("dry-run") === "true";

const DATABASE_URL = process.env.DATABASE_URL;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!BLOB_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN not set");
if (!GOOGLE_API_KEY && !DRY_RUN) throw new Error("GOOGLE_PLACES_API_KEY not set");

const sql = neon(DATABASE_URL);

const MIN_BYTES = 2_000;
const MAX_BYTES = 10 * 1024 * 1024;

type Row = { id: string; listing_id: string; url: string };

let migrated = 0;
let skipped = 0;
let failed = 0;
let bytesUploaded = 0;

async function migrateOne(row: Row): Promise<void> {
  if (!row.url.includes("googleapis.com/maps/api/place/photo")) {
    skipped++;
    return;
  }

  const sep = row.url.includes("?") ? "&" : "?";
  const fetchUrl = row.url.includes("key=")
    ? row.url
    : `${row.url}${sep}key=${GOOGLE_API_KEY}`;

  if (DRY_RUN) {
    migrated++;
    if (migrated % 100 === 0) console.log(`  [dry] ${migrated} rows seen`);
    return;
  }

  let res: Response;
  try {
    res = await fetch(fetchUrl, { redirect: "follow" });
  } catch (err: any) {
    failed++;
    console.warn(`  fetch error ${row.id}: ${err.message}`);
    return;
  }

  if (!res.ok) {
    failed++;
    if (failed <= 5 || failed % 50 === 0) {
      console.warn(`  HTTP ${res.status} for ${row.id} — leaving for cron`);
    }
    return;
  }

  const ct = res.headers.get("content-type") ?? "image/jpeg";
  if (!ct.startsWith("image/")) {
    failed++;
    console.warn(`  non-image content-type ${ct} for ${row.id}`);
    return;
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES) {
    failed++;
    console.warn(`  bad size ${buf.byteLength} for ${row.id}`);
    return;
  }

  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const key = `places/${row.id}.${ext}`;

  let blob;
  try {
    blob = await put(key, buf, {
      access: "public",
      contentType: ct,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: BLOB_TOKEN,
    });
  } catch (err: any) {
    failed++;
    console.warn(`  blob upload error ${row.id}: ${err.message}`);
    return;
  }

  await sql`UPDATE media SET url = ${blob.url} WHERE id = ${row.id}::uuid`;

  migrated++;
  bytesUploaded += buf.byteLength;
  if (migrated % 100 === 0) {
    console.log(
      `  ${migrated} migrated · ${(bytesUploaded / 1024 / 1024).toFixed(1)} MB · ${failed} failed`,
    );
  }
}

async function runPool(rows: Row[], concurrency: number): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < rows.length) {
      const idx = i++;
      await migrateOne(rows[idx]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log(
    `Migrating Google Place photos -> Vercel Blob (limit=${LIMIT === Infinity ? "all" : LIMIT}, concurrency=${CONCURRENCY}, dry-run=${DRY_RUN})`,
  );

  const limitClause = LIMIT === Infinity ? 1_000_000 : LIMIT;
  const rows = (await sql`
    SELECT id::text, listing_id::text, url
    FROM media
    WHERE url LIKE '%googleapis.com%'
    ORDER BY created_at DESC
    LIMIT ${limitClause}
  `) as unknown as Row[];

  console.log(`  ${rows.length} rows to process`);

  const t0 = Date.now();
  await runPool(rows, CONCURRENCY);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(
    `\nDone in ${elapsed}s · migrated=${migrated} · skipped=${skipped} · failed=${failed} · ${(bytesUploaded / 1024 / 1024).toFixed(1)} MB uploaded`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
