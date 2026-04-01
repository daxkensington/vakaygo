/**
 * Batch image processor for VakayGo
 *
 * Reads Google Places photo URLs from the media table, fetches them via the API,
 * adds a VakayGo watermark, uploads to Vercel Blob, and updates the database.
 *
 * Usage: npx tsx scripts/process-images.ts [--batch-size=100] [--dry-run]
 *
 * Requires:
 *   - DATABASE_URL env var
 *   - GOOGLE_PLACES_API_KEY env var
 *   - BLOB_READ_WRITE_TOKEN env var (Vercel Blob)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { media } from "@/drizzle/schema";
import { like, isNull, eq } from "drizzle-orm";
import sharp from "sharp";

const BATCH_SIZE = parseInt(process.argv.find((a) => a.startsWith("--batch-size="))?.split("=")[1] || "100");
const DRY_RUN = process.argv.includes("--dry-run");

const WATERMARK_TEXT = "VakayGo";
const WATERMARK_OPACITY = 0.4;

async function createWatermark(width: number, height: number): Promise<Buffer> {
  const fontSize = Math.max(16, Math.floor(width * 0.04));
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${width - 10}"
        y="${height - 10}"
        text-anchor="end"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
        opacity="${WATERMARK_OPACITY}"
      >${WATERMARK_TEXT}</text>
    </svg>`;
  return Buffer.from(svg);
}

async function processImage(url: string, apiKey: string): Promise<Buffer> {
  const fullUrl = url.includes("key=") ? url : `${url}&key=${apiKey}`;
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const w = metadata.width || 800;
  const h = metadata.height || 600;

  const watermarkSvg = await createWatermark(w, h);

  return image
    .composite([{ input: watermarkSvg, gravity: "southeast" }])
    .withMetadata({ exif: { IFD0: { ImageDescription: "VakayGo Caribbean Travel Platform - vakaygo.com" } } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function uploadToBlob(buffer: Buffer, filename: string): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN not set");

  // Use Vercel Blob REST API
  const res = await fetch(`https://blob.vercel-storage.com/${filename}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
      "x-cache-control-max-age": "31536000",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) throw new Error(`Blob upload failed: ${res.status}`);
  const data = await res.json() as { url: string };
  return data.url;
}

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY not set");
    process.exit(1);
  }

  const db = drizzle(neon(process.env.DATABASE_URL!));

  // Find Google Places URLs that haven't been processed yet
  const rows = await db
    .select({ id: media.id, url: media.url })
    .from(media)
    .where(like(media.url, "%googleapis.com/maps/api/place/photo%"))
    .limit(BATCH_SIZE);

  console.log(`Found ${rows.length} Google Places images to process (batch size: ${BATCH_SIZE})`);

  if (DRY_RUN) {
    console.log("DRY RUN - no changes will be made");
    rows.slice(0, 5).forEach((r) => console.log(`  ${r.id}: ${r.url.slice(0, 80)}...`));
    return;
  }

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const filename = `vakaygo/listings/${row.id}.jpg`;
      const watermarked = await processImage(row.url, apiKey);
      const blobUrl = await uploadToBlob(watermarked, filename);

      await db
        .update(media)
        .set({ url: blobUrl })
        .where(eq(media.id, row.id));

      processed++;
      if (processed % 10 === 0) {
        console.log(`  Processed ${processed}/${rows.length}`);
      }
    } catch (err) {
      failed++;
      console.error(`  Failed ${row.id}:`, (err as Error).message);
    }
  }

  console.log(`\nDone: ${processed} processed, ${failed} failed out of ${rows.length}`);
}

main().catch(console.error);
