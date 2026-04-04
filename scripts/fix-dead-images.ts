/**
 * Fix all dead images (expired Grok imgen.x.ai URLs)
 *
 * Strategy:
 * 1. Try Google Places photos first (if placeId exists)
 * 2. If no Google photos, generate with Grok, download immediately,
 *    save to /public/images/generated/, and store local path in DB
 * 3. If both fail, delete the dead record (card shows fallback gradient)
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... GROK_API_KEY=... npx tsx scripts/fix-dead-images.ts
 */

import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const GROK_API_KEY = process.env.GROK_API_KEY!;

const OUTPUT_DIR = path.join(process.cwd(), "public", "images", "generated");

const TYPE_PROMPTS: Record<string, string> = {
  stay: "Beautiful Caribbean boutique hotel with tropical gardens and ocean view, professional travel photography",
  tour: "Caribbean guided adventure, crystal clear water, tropical rainforest, vibrant travel photography",
  dining: "Caribbean seafood at beachside restaurant, fresh fish, tropical sunset ambiance, food photography",
  event: "Caribbean festival with live music and dancing under palm trees at sunset, event photography",
  transport: "Modern rental car on scenic Caribbean coastal road with palm trees and ocean, travel photography",
  transfer: "Professional airport transfer at Caribbean airport, clean vehicle, tropical backdrop",
  vip: "Luxury Caribbean private yacht or exclusive beach club, premium amenities, lifestyle photography",
  excursion: "Caribbean snorkeling in turquoise water with coral reefs and tropical fish, underwater photography",
  guide: "Local Caribbean guide leading group through colorful historic town, cultural photography",
};

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const sql = neon(DATABASE_URL);

  // Find all listings with dead Grok images
  const deadImages = await sql.query(
    "SELECT DISTINCT l.id, l.title, l.type, l.type_data->>'googlePlaceId' as place_id FROM listings l JOIN media m ON m.listing_id = l.id WHERE m.url LIKE $1 AND l.status = $2",
    ["%imgen.x.ai%", "active"]
  );

  console.log(`Found ${deadImages.length} listings with dead Grok images\n`);

  let googleFixed = 0;
  let grokFixed = 0;
  let deleted = 0;

  for (let idx = 0; idx < deadImages.length; idx++) {
    const listing = deadImages[idx];

    try {
      // === Strategy 1: Google Places ===
      if (listing.place_id && GOOGLE_API_KEY) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${listing.place_id}&fields=photos&key=${GOOGLE_API_KEY}`
        );
        const data = await res.json();

        if (data.status === "OK" && data.result?.photos?.length) {
          await sql.query("DELETE FROM media WHERE listing_id = $1 AND url LIKE $2", [listing.id, "%imgen.x.ai%"]);

          const photos = data.result.photos.slice(0, 3);
          for (let i = 0; i < photos.length; i++) {
            const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photos[i].photo_reference}`;
            await sql.query(
              "INSERT INTO media (id, listing_id, url, alt, type, sort_order, is_primary) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)",
              [listing.id, url, listing.title, "image", i, i === 0]
            );
          }
          googleFixed++;
          await new Promise((r) => setTimeout(r, 300));
          if ((idx + 1) % 25 === 0) console.log(`[${idx + 1}/${deadImages.length}] Google=${googleFixed} Grok=${grokFixed} Del=${deleted}`);
          continue;
        }
      }

      // === Strategy 2: Grok + download to local file ===
      if (GROK_API_KEY) {
        const prompt = TYPE_PROMPTS[listing.type] || TYPE_PROMPTS.tour;

        const grokRes = await fetch("https://api.x.ai/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "grok-imagine-image",
            prompt: `${prompt}. For: ${listing.title}`,
            n: 1,
          }),
        });

        if (grokRes.ok) {
          const grokData = await grokRes.json();
          const tempUrl = grokData.data?.[0]?.url;

          if (tempUrl) {
            // Download immediately before it expires
            const imgRes = await fetch(tempUrl);
            if (imgRes.ok) {
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              const filename = `${slugify(listing.title)}-${listing.id.slice(0, 8)}.jpg`;
              const filepath = path.join(OUTPUT_DIR, filename);
              fs.writeFileSync(filepath, buffer);

              // Store permanent local path in DB
              const localUrl = `/images/generated/${filename}`;
              await sql.query("DELETE FROM media WHERE listing_id = $1 AND url LIKE $2", [listing.id, "%imgen.x.ai%"]);
              await sql.query(
                "INSERT INTO media (id, listing_id, url, alt, type, sort_order, is_primary) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)",
                [listing.id, localUrl, listing.title, "image", 0, true]
              );
              grokFixed++;
              // Grok rate limit
              await new Promise((r) => setTimeout(r, 2500));
              if ((idx + 1) % 10 === 0) console.log(`[${idx + 1}/${deadImages.length}] Google=${googleFixed} Grok=${grokFixed} Del=${deleted}`);
              continue;
            }
          }
        }
      }

      // === Strategy 3: Delete dead record (fallback gradient shows) ===
      await sql.query("DELETE FROM media WHERE listing_id = $1 AND url LIKE $2", [listing.id, "%imgen.x.ai%"]);
      deleted++;
    } catch (e) {
      console.error(`Error [${listing.title}]:`, e);
      await sql.query("DELETE FROM media WHERE listing_id = $1 AND url LIKE $2", [listing.id, "%imgen.x.ai%"]).catch(() => {});
      deleted++;
    }

    if ((idx + 1) % 25 === 0) console.log(`[${idx + 1}/${deadImages.length}] Google=${googleFixed} Grok=${grokFixed} Del=${deleted}`);
  }

  console.log(`\n=== Complete ===`);
  console.log(`Google Places photos: ${googleFixed}`);
  console.log(`Grok generated + saved locally: ${grokFixed}`);
  console.log(`Deleted (no source available): ${deleted}`);
  console.log(`Total: ${googleFixed + grokFixed + deleted} / ${deadImages.length}`);

  if (grokFixed > 0) {
    console.log(`\nIMPORTANT: Run 'git add public/images/generated/ && git commit && git push' to deploy the generated images!`);
  }
}

main().catch(console.error);
