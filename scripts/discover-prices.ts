/**
 * Discover pricing from business websites
 * Scrapes websites for price indicators and updates listings
 *
 * Looks for:
 * - Structured data (JSON-LD) with price/priceRange
 * - Meta tags with pricing
 * - Common price patterns in page content ($XX, USD XX, from XX per person)
 * - Booking widget prices
 *
 * Usage: DATABASE_URL=... npx tsx scripts/discover-prices.ts
 * Options:
 *   --limit=500       Process N listings (default 500)
 *   --type=stay        Only process specific type
 *   --dry-run          Report only, don't update
 *   --concurrency=5    Parallel requests (default 5)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const a = args.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const limit = parseInt(getArg("limit") || "500");
const typeFilter = getArg("type");
const dryRun = args.includes("--dry-run");
const concurrency = parseInt(getArg("concurrency") || "5");

interface PriceResult {
  amount: number;
  unit: string;
  currency: string;
  source: string;
  confidence: "high" | "medium" | "low";
}

// Price unit mapping by listing type
const DEFAULT_UNITS: Record<string, string> = {
  stay: "night",
  tour: "person",
  dining: "person",
  excursion: "person",
  event: "person",
  transfer: "trip",
  transport: "day",
  vip: "person",
  guide: "hour",
};

function extractPricesFromHtml(
  html: string,
  listingType: string
): PriceResult[] {
  const results: PriceResult[] = [];

  // 1. JSON-LD structured data
  const jsonLdMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const m of jsonLdMatches) {
    try {
      const ld = JSON.parse(m[1]);
      // Direct price
      if (ld.offers?.price || ld.offers?.lowPrice) {
        const price = parseFloat(ld.offers.price || ld.offers.lowPrice);
        if (price > 0 && price < 50000) {
          results.push({
            amount: price,
            unit: DEFAULT_UNITS[listingType] || "person",
            currency: ld.offers.priceCurrency || "USD",
            source: "jsonld",
            confidence: "high",
          });
        }
      }
      // Price range
      if (ld.priceRange) {
        const rangeMatch = ld.priceRange.match(
          /\$?\s*(\d+(?:\.\d{2})?)/
        );
        if (rangeMatch) {
          results.push({
            amount: parseFloat(rangeMatch[1]),
            unit: DEFAULT_UNITS[listingType] || "person",
            currency: "USD",
            source: "jsonld-range",
            confidence: "medium",
          });
        }
      }
      // Array of offers
      if (Array.isArray(ld.offers)) {
        for (const offer of ld.offers.slice(0, 3)) {
          const price = parseFloat(offer.price || offer.lowPrice || "0");
          if (price > 0 && price < 50000) {
            results.push({
              amount: price,
              unit: DEFAULT_UNITS[listingType] || "person",
              currency: offer.priceCurrency || "USD",
              source: "jsonld-offers",
              confidence: "high",
            });
          }
        }
      }
    } catch {}
  }

  // 2. Meta tags
  const metaPrice = html.match(
    /<meta[^>]*(?:property|name)=["'](?:og:price:amount|product:price:amount)["'][^>]*content=["']([^"']+)["']/i
  );
  if (metaPrice) {
    const price = parseFloat(metaPrice[1]);
    if (price > 0 && price < 50000) {
      results.push({
        amount: price,
        unit: DEFAULT_UNITS[listingType] || "person",
        currency: "USD",
        source: "meta",
        confidence: "high",
      });
    }
  }

  // 3. Common price patterns in visible text (strip tags first)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  // "From $XX" or "Starting at $XX" patterns
  const fromPatterns = [
    /(?:from|starting\s+(?:at|from)|prices?\s+from|rates?\s+from)\s*\$\s*(\d+(?:\.\d{2})?)/gi,
    /\$\s*(\d+(?:\.\d{2})?)\s*(?:per\s+(?:person|night|day|trip|hour|group|guest|adult|room))/gi,
    /(?:USD|US\$)\s*(\d+(?:\.\d{2})?)/gi,
  ];

  for (const pattern of fromPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const price = parseFloat(match[1]);
      // Sanity check: reasonable price range
      if (price >= 5 && price <= 10000) {
        // Determine unit from context
        let unit = DEFAULT_UNITS[listingType] || "person";
        const context = match[0].toLowerCase();
        if (context.includes("night") || context.includes("room"))
          unit = "night";
        else if (context.includes("person") || context.includes("adult") || context.includes("guest"))
          unit = "person";
        else if (context.includes("day")) unit = "day";
        else if (context.includes("trip")) unit = "trip";
        else if (context.includes("hour")) unit = "hour";
        else if (context.includes("group")) unit = "group";

        results.push({
          amount: price,
          unit,
          currency: "USD",
          source: "text-pattern",
          confidence: "medium",
        });
      }
    }
  }

  // 4. Booking.com / Expedia style price boxes
  const bookingPrice = html.match(
    /data-price=["'](\d+(?:\.\d{2})?)["']/i
  );
  if (bookingPrice) {
    const price = parseFloat(bookingPrice[1]);
    if (price > 0 && price < 50000) {
      results.push({
        amount: price,
        unit: DEFAULT_UNITS[listingType] || "night",
        currency: "USD",
        source: "data-attr",
        confidence: "high",
      });
    }
  }

  return results;
}

function pickBestPrice(results: PriceResult[]): PriceResult | null {
  if (results.length === 0) return null;

  // Prefer high confidence, then medium
  const sorted = results.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    return confOrder[a.confidence] - confOrder[b.confidence];
  });

  // If multiple high-confidence, pick lowest (likely the "from" price)
  const highConf = sorted.filter((r) => r.confidence === "high");
  if (highConf.length > 0) {
    return highConf.reduce((a, b) => (a.amount < b.amount ? a : b));
  }

  // Otherwise pick the most common price
  return sorted[0];
}

async function fetchAndExtractPrice(
  url: string,
  listingType: string
): Promise<PriceResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();
    const prices = extractPricesFromHtml(html, listingType);
    return pickBestPrice(prices);
  } catch {
    return null;
  }
}

async function main() {
  const db = drizzle(neon(DATABASE_URL));

  const typeCondition = typeFilter ? sql`AND l.type = ${typeFilter}` : sql``;

  const result = await db.execute(sql`
    SELECT l.id, l.title, l.type, l.type_data->>'website' as website
    FROM listings l
    WHERE l.status = 'active'
      AND (l.price_amount IS NULL OR l.price_amount = 0)
      AND l.type_data->>'website' IS NOT NULL
      AND l.type_data->>'website' != ''
      ${typeCondition}
    ORDER BY l.avg_rating DESC NULLS LAST
    LIMIT ${limit}
  `);

  const listings = result.rows as any[];
  console.log(`Found ${listings.length} listings with websites but no price\n`);
  if (dryRun) console.log("=== DRY RUN ===\n");

  let found = 0;
  let failed = 0;
  let skipped = 0;

  const bySource: Record<string, number> = {};
  const byType: Record<string, { found: number; total: number }> = {};

  for (let i = 0; i < listings.length; i += concurrency) {
    const batch = listings.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing: any) => {
        if (!byType[listing.type])
          byType[listing.type] = { found: 0, total: 0 };
        byType[listing.type].total++;

        const price = await fetchAndExtractPrice(
          listing.website,
          listing.type
        );

        if (price) {
          found++;
          byType[listing.type].found++;
          bySource[price.source] = (bySource[price.source] || 0) + 1;

          if (dryRun) {
            console.log(
              `  ${listing.title}: $${price.amount}/${price.unit} (${price.source}, ${price.confidence})`
            );
          } else {
            await db.execute(sql`
              UPDATE listings
              SET price_amount = ${price.amount},
                  price_unit = ${price.unit}
              WHERE id = ${listing.id}::uuid
            `);
          }
          process.stdout.write("$");
        } else {
          skipped++;
          process.stdout.write("-");
        }
      })
    );

    await new Promise((r) => setTimeout(r, 300));

    if ((i + concurrency) % 100 < concurrency) {
      console.log(
        `\n[${Math.min(i + concurrency, listings.length)}/${listings.length}] Found: ${found} | Skipped: ${skipped}`
      );
    }
  }

  console.log(`\n\n=== PRICE DISCOVERY COMPLETE ===`);
  console.log(`Found prices:  ${found}`);
  console.log(`No price:      ${skipped}`);
  console.log(`\nBy source:`);
  for (const [source, count] of Object.entries(bySource)) {
    console.log(`  ${source}: ${count}`);
  }
  console.log(`\nBy type:`);
  for (const [type, stats] of Object.entries(byType)) {
    console.log(
      `  ${type}: ${stats.found}/${stats.total} (${((stats.found / stats.total) * 100).toFixed(0)}%)`
    );
  }
}

main().catch(console.error);
