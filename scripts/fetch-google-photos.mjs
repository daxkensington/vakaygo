/**
 * Fetch Google Places photos for listings with 0-1 photos.
 *
 * Strategy:
 * 1. Query listings with 0-1 media records
 * 2. For each: Text Search Google Places by "title + island"
 * 3. Get Place ID → Place Details (up to 10 photos)
 * 4. Insert photo references into media table
 * 5. Update listing typeData with placeId
 *
 * Uses Google Places API (Text Search + Details).
 * Photos are stored as proxy URLs: /api/images/proxy?ref=PHOTO_REF
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!DATABASE_URL || !GOOGLE_KEY) {
  console.error("Missing DATABASE_URL or GOOGLE_PLACES_API_KEY");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const BATCH_SIZE = 50;
const DELAY_MS = 200; // between API calls to avoid rate limits
const MAX_PHOTOS_PER_LISTING = 10;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function photoUrl(ref) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}`;
}

async function searchPlace(query) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.results && data.results.length > 0) {
    return data.results[0];
  }
  return null;
}

async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,photos,rating,user_ratings_total&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || null;
}

async function main() {
  console.log("Fetching listings with 0-1 photos...");

  const listings = await sql`
    SELECT l.id, l.title, l.type, l.type_data, i.name as island_name,
      COALESCE(m.cnt, 0) as photo_count
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    LEFT JOIN (SELECT listing_id, count(*) as cnt FROM media GROUP BY listing_id) m ON m.listing_id = l.id
    WHERE l.status = 'active' AND COALESCE(m.cnt, 0) <= 1
    ORDER BY COALESCE(m.cnt, 0) ASC, l.title
  `;

  console.log(`Found ${listings.length} listings to process.\n`);

  let processed = 0;
  let photosAdded = 0;
  let notFound = 0;
  let noPhotos = 0;
  let errors = 0;

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    const searchQuery = `${listing.title} ${listing.island_name}`;

    try {
      // Step 1: Text Search to find Place ID
      const place = await searchPlace(searchQuery);
      await sleep(DELAY_MS);

      if (!place) {
        notFound++;
        console.log(`[${i + 1}/${listings.length}] NOT FOUND: ${listing.title} (${listing.island_name})`);
        continue;
      }

      // Step 2: Place Details for up to 10 photos
      const details = await getPlaceDetails(place.place_id);
      await sleep(DELAY_MS);

      if (!details || !details.photos || details.photos.length === 0) {
        noPhotos++;
        console.log(`[${i + 1}/${listings.length}] NO PHOTOS: ${listing.title} → ${place.name}`);

        // Still save the placeId
        const td = listing.type_data || {};
        td.placeId = place.place_id;
        await sql`UPDATE listings SET type_data = ${JSON.stringify(td)}::jsonb WHERE id = ${listing.id}`;
        continue;
      }

      // Step 3: Insert photos into media table
      const photos = details.photos.slice(0, MAX_PHOTOS_PER_LISTING);
      let insertedCount = 0;

      for (let j = 0; j < photos.length; j++) {
        const photo = photos[j];
        const url = photoUrl(photo.photo_reference);

        // Check if this photo reference already exists for this listing
        const existing = await sql`
          SELECT id FROM media WHERE listing_id = ${listing.id} AND url = ${url} LIMIT 1
        `;

        if (existing.length === 0) {
          await sql`
            INSERT INTO media (listing_id, url, alt, type, sort_order, is_primary, width, height)
            VALUES (
              ${listing.id},
              ${url},
              ${listing.title},
              'image',
              ${j},
              ${j === 0},
              ${photo.width || 800},
              ${photo.height || 600}
            )
          `;
          insertedCount++;
        }
      }

      // Step 4: Update typeData with placeId
      const td = listing.type_data || {};
      td.placeId = place.place_id;
      if (details.rating) td.googleRating = details.rating;
      if (details.user_ratings_total) td.googleReviewCount = details.user_ratings_total;
      await sql`UPDATE listings SET type_data = ${JSON.stringify(td)}::jsonb WHERE id = ${listing.id}`;

      photosAdded += insertedCount;
      processed++;
      console.log(`[${i + 1}/${listings.length}] +${insertedCount} photos: ${listing.title} → ${place.name} (${listing.island_name})`);

    } catch (err) {
      errors++;
      console.error(`[${i + 1}/${listings.length}] ERROR: ${listing.title}:`, err.message);
    }

    // Progress report every 50 listings
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`\n--- Progress: ${i + 1}/${listings.length} | +${photosAdded} photos | ${notFound} not found | ${errors} errors ---\n`);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`COMPLETE`);
  console.log(`Processed: ${processed}/${listings.length}`);
  console.log(`Photos added: ${photosAdded}`);
  console.log(`Not found on Google: ${notFound}`);
  console.log(`Found but no photos: ${noPhotos}`);
  console.log(`Errors: ${errors}`);
  console.log(`${"=".repeat(50)}`);
}

main().catch(console.error);
