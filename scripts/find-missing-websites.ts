/**
 * Find websites for listings that don't have one
 * Uses Google search to discover business websites, Facebook pages,
 * TripAdvisor profiles, Viator listings, etc.
 *
 * Then scrapes those pages for descriptions and prices.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/find-missing-websites.ts
 * Options:
 *   --limit=500        Process N listings (default 500)
 *   --type=dining       Only process specific type
 *   --dry-run           Report only
 *   --concurrency=3     Parallel requests (default 3)
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
const concurrency = parseInt(getArg("concurrency") || "3");

interface FindResult {
  website?: string;
  description?: string;
  priceAmount?: number;
  priceUnit?: string;
  source: string;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
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
    return await res.text();
  } catch {
    return null;
  }
}

function extractDescription(html: string): string | null {
  const ogDesc =
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1];
  const metaDesc =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1];

  const desc = ogDesc || metaDesc;
  if (!desc || desc.length < 30) return null;

  const cleaned = desc
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

  if (cleaned.includes("just a moment") || cleaned.includes("access denied")) return null;
  return cleaned;
}

function extractPrice(html: string, type: string): { amount: number; unit: string } | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  const units: Record<string, string> = {
    stay: "night", tour: "person", dining: "person", excursion: "person",
    transfer: "trip", transport: "day", vip: "person", event: "person", guide: "hour",
  };

  const patterns = [
    /(?:from|starting\s+(?:at|from)|prices?\s+from|rates?\s+from)\s*\$\s*(\d+(?:\.\d{2})?)/gi,
    /\$\s*(\d+(?:\.\d{2})?)\s*(?:per\s+(?:person|night|day|trip|hour|group|guest|adult|room))/gi,
    /(?:USD|US\$)\s*(\d+(?:\.\d{2})?)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const price = parseFloat(match[1]);
      if (price >= 5 && price <= 10000) {
        let unit = units[type] || "person";
        const ctx = match[0].toLowerCase();
        if (ctx.includes("night") || ctx.includes("room")) unit = "night";
        else if (ctx.includes("person") || ctx.includes("adult")) unit = "person";
        else if (ctx.includes("day")) unit = "day";
        else if (ctx.includes("trip")) unit = "trip";
        return { amount: price, unit };
      }
    }
  }
  return null;
}

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

// Use Google Places to find website + details for businesses we already have placeIds for
async function fetchPlaceWebsite(
  placeId: string
): Promise<{ website?: string; description?: string } | null> {
  if (!GOOGLE_API_KEY || !placeId) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,editorial_summary&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.status !== "OK") return null;
    return {
      website: data.result.website || undefined,
      description: data.result.editorial_summary?.overview || undefined,
    };
  } catch {
    return null;
  }
}

async function searchForBusiness(
  name: string,
  island: string,
  type: string,
  placeId?: string
): Promise<FindResult | null> {
  // Strategy 1: Google Places API (reliable, no blocking)
  if (placeId && GOOGLE_API_KEY) {
    const placeData = await fetchPlaceWebsite(placeId);
    if (placeData?.website) {
      // Found a website via Places — now scrape it
      const page = await fetchPage(placeData.website);
      if (page) {
        const description = extractDescription(page) || placeData.description;
        const price = extractPrice(page, type);
        return {
          website: placeData.website,
          description: description || undefined,
          priceAmount: price?.amount,
          priceUnit: price?.unit,
          source: "google-places",
        };
      }
      // Even if scrape fails, return the website
      return {
        website: placeData.website,
        description: placeData.description || undefined,
        source: "google-places",
      };
    }
    // No website but maybe a description
    if (placeData?.description) {
      return {
        description: placeData.description,
        source: "google-places-desc",
      };
    }
  }

  // Strategy 2: Google web search (may get blocked)
  try {
    const query = encodeURIComponent(`${name} ${island} Caribbean`);
    const res = await fetch(`https://www.google.com/search?q=${query}&num=8`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract URLs from search results — prioritize business sites over directories
    const urlPatterns = [
      // Business websites (not social/directory)
      /https?:\/\/(?!www\.google|www\.facebook|www\.instagram|www\.youtube|www\.tripadvisor|www\.yelp|www\.viator)[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(?:\/[^\s"'<>]*)?/gi,
      // TripAdvisor
      /https?:\/\/(?:www\.)?tripadvisor\.com\/[^\s"'<>]+/gi,
      // Viator / GetYourGuide
      /https?:\/\/(?:www\.)?viator\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?getyourguide\.com\/[^\s"'<>]+/gi,
      // Booking.com
      /https?:\/\/(?:www\.)?booking\.com\/[^\s"'<>]+/gi,
      // Facebook pages
      /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/gi,
    ];

    for (const pattern of urlPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const m of matches.slice(0, 3)) {
        const url = m[0].replace(/['"<>].*$/, "");

        // Skip Google's own URLs
        if (url.includes("google.com") || url.includes("gstatic.com")) continue;
        if (url.includes("webcache") || url.includes("translate.google")) continue;

        const page = await fetchPage(url);
        if (!page) continue;

        const description = extractDescription(page);
        const price = extractPrice(page, type);

        const source = url.includes("tripadvisor") ? "tripadvisor"
          : url.includes("viator") ? "viator"
          : url.includes("getyourguide") ? "getyourguide"
          : url.includes("booking.com") ? "booking"
          : url.includes("facebook.com") ? "facebook"
          : "website";

        // Only return if we found something useful
        if (description || price) {
          return {
            website: source === "website" ? url : undefined,
            description: description || undefined,
            priceAmount: price?.amount,
            priceUnit: price?.unit,
            source,
          };
        }
      }
    }
  } catch {}
  return null;
}

async function main() {
  const db = drizzle(neon(DATABASE_URL));

  const typeCondition = typeFilter ? sql`AND l.type = ${typeFilter}` : sql``;

  const result = await db.execute(sql`
    SELECT l.id, l.title, l.type, l.description,
      l.type_data as "typeData",
      i.name as island
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    WHERE l.status = 'active'
      AND (l.type_data->>'website' IS NULL OR l.type_data->>'website' = '')
      ${typeCondition}
    ORDER BY l.avg_rating DESC NULLS LAST
    LIMIT ${limit}
  `);

  const listings = result.rows as any[];
  console.log(`Found ${listings.length} listings without websites\n`);
  if (dryRun) console.log("=== DRY RUN ===\n");

  const stats: Record<string, number> = { found: 0, skipped: 0 };
  const bySource: Record<string, number> = {};
  let descsFound = 0;
  let pricesFound = 0;
  let websitesFound = 0;

  for (let i = 0; i < listings.length; i += concurrency) {
    const batch = listings.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing: any) => {
        const td = listing.typeData || {};
        const result = await searchForBusiness(listing.title, listing.island, listing.type, td.googlePlaceId);

        if (!result) {
          stats.skipped++;
          process.stdout.write("-");
          return;
        }

        stats.found++;
        bySource[result.source] = (bySource[result.source] || 0) + 1;

        if (dryRun) {
          const parts: string[] = [result.source];
          if (result.website) parts.push(result.website);
          if (result.description) parts.push(`desc(${result.description.length}ch)`);
          if (result.priceAmount) parts.push(`$${result.priceAmount}/${result.priceUnit}`);
          console.log(`  ${listing.title}: ${parts.join(" | ")}`);
          return;
        }

        const newTd = { ...td };
        if (result.website) {
          newTd.website = result.website;
          websitesFound++;
        }

        const descUpdate = result.description && listing.description.length < 200
          ? sql`, description = ${result.description}`
          : sql``;
        const priceUpdate = result.priceAmount
          ? sql`, price_amount = ${result.priceAmount}, price_unit = ${result.priceUnit}`
          : sql``;

        if (result.description && listing.description.length < 200) descsFound++;
        if (result.priceAmount) pricesFound++;

        await db.execute(sql`
          UPDATE listings
          SET type_data = ${JSON.stringify(newTd)}::jsonb
            ${descUpdate}
            ${priceUpdate}
          WHERE id = ${listing.id}::uuid
        `);

        process.stdout.write(result.priceAmount ? "$" : result.description ? "D" : "w");
      })
    );

    // Longer delay — Google search rate limiting
    await new Promise((r) => setTimeout(r, 2000));

    if ((i + concurrency) % 30 < concurrency) {
      console.log(
        `\n[${Math.min(i + concurrency, listings.length)}/${listings.length}] ` +
          `Found:${stats.found} Web:${websitesFound} Desc:${descsFound} Price:${pricesFound} Skip:${stats.skipped}`
      );
    }
  }

  console.log(`\n\n=== SEARCH COMPLETE ===`);
  console.log(`Websites found:     ${websitesFound}`);
  console.log(`Descriptions found: ${descsFound}`);
  console.log(`Prices found:       ${pricesFound}`);
  console.log(`\nBy source:`);
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count}`);
  }
}

main().catch(console.error);
