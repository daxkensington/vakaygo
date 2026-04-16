/**
 * Enrich listings with Google Places detail data
 *
 * Pulls per listing:
 * - price_level (1-4) → mapped to estimated price amounts
 * - editorial_summary → better description if we still have a generated one
 * - formatted_phone_number → update phone if missing
 * - website → update if missing
 * - opening_hours → structured hours
 * - types → richer categorization
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/enrich-from-google.ts
 * Options:
 *   --limit=500       Process N listings (default 500)
 *   --type=dining      Only process specific type
 *   --dry-run          Report only
 *   --concurrency=5    Parallel requests (default 5)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const a = args.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const limit = parseInt(getArg("limit") || "500");
const typeFilter = getArg("type");
const dryRun = args.includes("--dry-run");
const concurrency = parseInt(getArg("concurrency") || "5");

// Map Google price_level to estimated price amounts by listing type
const PRICE_MAP: Record<string, Record<number, { amount: number; unit: string }>> = {
  dining: {
    1: { amount: 10, unit: "person" },
    2: { amount: 25, unit: "person" },
    3: { amount: 50, unit: "person" },
    4: { amount: 100, unit: "person" },
  },
  stay: {
    1: { amount: 60, unit: "night" },
    2: { amount: 150, unit: "night" },
    3: { amount: 300, unit: "night" },
    4: { amount: 600, unit: "night" },
  },
  tour: {
    1: { amount: 30, unit: "person" },
    2: { amount: 75, unit: "person" },
    3: { amount: 150, unit: "person" },
    4: { amount: 300, unit: "person" },
  },
  excursion: {
    1: { amount: 40, unit: "person" },
    2: { amount: 90, unit: "person" },
    3: { amount: 180, unit: "person" },
    4: { amount: 350, unit: "person" },
  },
  transport: {
    1: { amount: 30, unit: "day" },
    2: { amount: 60, unit: "day" },
    3: { amount: 120, unit: "day" },
    4: { amount: 250, unit: "day" },
  },
  transfer: {
    1: { amount: 25, unit: "trip" },
    2: { amount: 50, unit: "trip" },
    3: { amount: 100, unit: "trip" },
    4: { amount: 200, unit: "trip" },
  },
  vip: {
    1: { amount: 100, unit: "person" },
    2: { amount: 250, unit: "person" },
    3: { amount: 500, unit: "person" },
    4: { amount: 1000, unit: "person" },
  },
  event: {
    1: { amount: 20, unit: "person" },
    2: { amount: 50, unit: "person" },
    3: { amount: 100, unit: "person" },
    4: { amount: 200, unit: "person" },
  },
  guide: {
    1: { amount: 25, unit: "hour" },
    2: { amount: 50, unit: "hour" },
    3: { amount: 100, unit: "hour" },
    4: { amount: 200, unit: "hour" },
  },
};

const FIELDS = [
  "price_level",
  "editorial_summary",
  "formatted_phone_number",
  "international_phone_number",
  "website",
  "opening_hours",
  "types",
  "url",
].join(",");

interface PlaceDetails {
  price_level?: number;
  editorial_summary?: { overview: string };
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  opening_hours?: { weekday_text: string[] };
  types?: string[];
  url?: string;
}

async function fetchPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${FIELDS}&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.status !== "OK") return null;
    return data.result;
  } catch {
    return null;
  }
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY required");
    process.exit(1);
  }

  const db = drizzle(neon(DATABASE_URL));

  const typeCondition = typeFilter ? sql`AND l.type = ${typeFilter}` : sql``;

  // Get listings that have a Google Place ID and are missing price or have generated descriptions
  const result = await db.execute(sql`
    SELECT l.id, l.title, l.type, l.description,
      l.price_amount as "priceAmount",
      l.type_data as "typeData"
    FROM listings l
    WHERE l.status = 'active'
      AND l.type_data->>'googlePlaceId' IS NOT NULL
      ${typeCondition}
    ORDER BY
      CASE WHEN l.price_amount IS NULL OR l.price_amount = 0 THEN 0 ELSE 1 END,
      l.avg_rating DESC NULLS LAST
    LIMIT ${limit}
  `);

  const listings = result.rows as any[];
  console.log(`Processing ${listings.length} listings with Google Place IDs\n`);
  if (dryRun) console.log("=== DRY RUN ===\n");

  const stats = {
    priceSet: 0,
    descriptionUpgraded: 0,
    phoneAdded: 0,
    websiteAdded: 0,
    hoursUpdated: 0,
    googleMapsUrlAdded: 0,
    noData: 0,
    errors: 0,
  };

  for (let i = 0; i < listings.length; i += concurrency) {
    const batch = listings.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing: any) => {
        const td = listing.typeData || {};
        const placeId = td.googlePlaceId;
        if (!placeId) return;

        const details = await fetchPlaceDetails(placeId);
        if (!details) {
          stats.noData++;
          process.stdout.write("-");
          return;
        }

        const updates: string[] = [];
        let newTypeData = { ...td };
        let priceAmount: number | null = null;
        let priceUnit: string | null = null;
        let newDescription: string | null = null;

        // 1. Price from price_level
        if (
          details.price_level &&
          (!listing.priceAmount || parseFloat(listing.priceAmount) === 0)
        ) {
          const priceMap = PRICE_MAP[listing.type] || PRICE_MAP.tour;
          const mapped = priceMap[details.price_level];
          if (mapped) {
            priceAmount = mapped.amount;
            priceUnit = mapped.unit;
            stats.priceSet++;
            updates.push(`$${mapped.amount}/${mapped.unit}`);
          }
        }

        // 2. Editorial summary → better description
        if (
          details.editorial_summary?.overview &&
          details.editorial_summary.overview.length >= 30
        ) {
          // Only upgrade if current description is generated (short/generic)
          const isGenerated =
            !listing.description ||
            listing.description.length < 200 ||
            listing.description.includes("claim it for free") ||
            listing.description.includes("Claim this listing");

          if (isGenerated) {
            newDescription = details.editorial_summary.overview;
            stats.descriptionUpgraded++;
            updates.push("desc");
          }
        }

        // 3. Phone
        if (!td.phone && details.international_phone_number) {
          newTypeData.phone = details.international_phone_number;
          stats.phoneAdded++;
          updates.push("phone");
        }

        // 4. Website
        if (!td.website && details.website) {
          newTypeData.website = details.website;
          stats.websiteAdded++;
          updates.push("website");
        }

        // 5. Hours
        if (details.opening_hours?.weekday_text) {
          newTypeData.hours = details.opening_hours.weekday_text;
          stats.hoursUpdated++;
        }

        // 6. Google Maps URL
        if (!td.googleMapsUrl && details.url) {
          newTypeData.googleMapsUrl = details.url;
          stats.googleMapsUrlAdded++;
        }

        // 7. Store price_level for reference
        if (details.price_level) {
          newTypeData.priceLevel = details.price_level;
        }

        if (updates.length === 0 && !details.opening_hours && !details.url) {
          process.stdout.write(".");
          return;
        }

        if (dryRun) {
          if (updates.length > 0) {
            console.log(`  ${listing.title}: ${updates.join(", ")}`);
          }
          return;
        }

        // Build update query
        try {
          if (priceAmount && newDescription) {
            await db.execute(sql`
              UPDATE listings
              SET price_amount = ${priceAmount},
                  price_unit = ${priceUnit},
                  description = ${newDescription},
                  type_data = ${JSON.stringify(newTypeData)}::jsonb
              WHERE id = ${listing.id}::uuid
            `);
          } else if (priceAmount) {
            await db.execute(sql`
              UPDATE listings
              SET price_amount = ${priceAmount},
                  price_unit = ${priceUnit},
                  type_data = ${JSON.stringify(newTypeData)}::jsonb
              WHERE id = ${listing.id}::uuid
            `);
          } else if (newDescription) {
            await db.execute(sql`
              UPDATE listings
              SET description = ${newDescription},
                  type_data = ${JSON.stringify(newTypeData)}::jsonb
              WHERE id = ${listing.id}::uuid
            `);
          } else {
            await db.execute(sql`
              UPDATE listings
              SET type_data = ${JSON.stringify(newTypeData)}::jsonb
              WHERE id = ${listing.id}::uuid
            `);
          }

          process.stdout.write(updates.length > 0 ? "+" : ".");
        } catch (e) {
          stats.errors++;
          process.stdout.write("!");
        }
      })
    );

    // Rate limit — Places Details API
    await new Promise((r) => setTimeout(r, 400));

    if ((i + concurrency) % 100 < concurrency) {
      console.log(
        `\n[${Math.min(i + concurrency, listings.length)}/${listings.length}] ` +
          `Price:${stats.priceSet} Desc:${stats.descriptionUpgraded} ` +
          `Phone:${stats.phoneAdded} Web:${stats.websiteAdded} Hrs:${stats.hoursUpdated}`
      );
    }
  }

  console.log(`\n\n=== GOOGLE ENRICHMENT COMPLETE ===`);
  console.log(`Prices set:            ${stats.priceSet}`);
  console.log(`Descriptions upgraded: ${stats.descriptionUpgraded}`);
  console.log(`Phones added:          ${stats.phoneAdded}`);
  console.log(`Websites added:        ${stats.websiteAdded}`);
  console.log(`Hours updated:         ${stats.hoursUpdated}`);
  console.log(`Google Maps URLs:      ${stats.googleMapsUrlAdded}`);
  console.log(`No data returned:      ${stats.noData}`);
  console.log(`Errors:                ${stats.errors}`);
}

main().catch(console.error);
