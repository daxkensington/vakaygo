/**
 * Enrich listing descriptions from real sources
 *
 * Strategy per listing:
 * 1. Google Places editorial_summary (most authoritative)
 * 2. Website "about" content (og:description, meta description, about sections)
 * 3. Generated from known data (type, category, location, rating, hours)
 *
 * Also generates proper headlines instead of "Discover [Name]"
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/enrich-descriptions.ts
 * Options:
 *   --limit=500        Process N listings (default 500)
 *   --type=dining       Only process specific type
 *   --source=website    Only try specific source (google|website|generate)
 *   --dry-run           Report only
 *   --concurrency=5     Parallel requests (default 5)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const a = args.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const limit = parseInt(getArg("limit") || "500");
const typeFilter = getArg("type");
const sourceFilter = getArg("source");
const dryRun = args.includes("--dry-run");
const concurrency = parseInt(getArg("concurrency") || "5");

interface EnrichResult {
  description: string;
  headline: string;
  source: string;
}

// ── Google Places editorial summary ───────────────────────────────────

async function fetchGoogleDescription(
  placeId: string
): Promise<string | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=editorial_summary,website&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.status !== "OK") return null;
    return data.result?.editorial_summary?.overview || null;
  } catch {
    return null;
  }
}

// ── Website scraping ──────────────────────────────────────────────────

async function fetchWebsiteDescription(
  url: string
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VakayGoBot/1.0; +https://vakaygo.com)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    // Priority 1: og:description
    const ogDesc =
      html.match(
        /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
      )?.[1] ||
      html.match(
        /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i
      )?.[1];

    // Priority 2: meta description
    const metaDesc =
      html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
      )?.[1] ||
      html.match(
        /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i
      )?.[1];

    // Priority 3: JSON-LD description
    let jsonLdDesc: string | null = null;
    const jsonLdMatches = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const m of jsonLdMatches) {
      try {
        const ld = JSON.parse(m[1]);
        if (ld.description && typeof ld.description === "string") {
          jsonLdDesc = ld.description;
          break;
        }
      } catch {}
    }

    // Pick the best one
    const candidates = [ogDesc, metaDesc, jsonLdDesc].filter(Boolean) as string[];

    for (const candidate of candidates) {
      const cleaned = candidate
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      // Skip if too short, too generic, or looks like a template
      if (cleaned.length < 30) continue;
      if (cleaned.toLowerCase().includes("claim this listing")) continue;
      if (cleaned.toLowerCase().includes("just a moment")) continue;
      if (cleaned.toLowerCase().includes("access denied")) continue;
      if (cleaned.toLowerCase().includes("page not found")) continue;
      if (cleaned.toLowerCase().includes("enable javascript")) continue;

      return cleaned;
    }

    return null;
  } catch {
    return null;
  }
}

// ── Generate from known data ──────────────────────────────────────────

const TYPE_TEMPLATES: Record<string, (ctx: any) => string> = {
  stay: (ctx) => {
    const cat = ctx.category || "accommodation";
    const rating = ctx.avgRating
      ? `Rated ${ctx.avgRating}/5 by guests`
      : "";
    return `${ctx.title} is a ${cat.toLowerCase()} in ${ctx.parish || ctx.island}. ${rating}${ctx.hours ? " Open " + simplifyHours(ctx.hours) + "." : ""}`.trim();
  },
  tour: (ctx) => {
    const cats = formatGoogleTypes(ctx.googleTypes, "tour");
    return `${ctx.title} offers ${cats} experiences in ${ctx.parish || ctx.island}. ${ctx.avgRating ? `Rated ${ctx.avgRating}/5 by visitors.` : ""}`.trim();
  },
  dining: (ctx) => {
    const cat = ctx.category || formatGoogleTypes(ctx.googleTypes, "restaurant");
    const rating = ctx.avgRating
      ? `Rated ${ctx.avgRating}/5`
      : "";
    const hours = ctx.hours ? simplifyHours(ctx.hours) : "";
    return `${ctx.title} is a ${cat.toLowerCase()} in ${ctx.parish || ctx.island}. ${rating}${hours ? `. Open ${hours}` : ""}.`.replace(/\.\./g, ".").trim();
  },
  excursion: (ctx) => {
    return `${ctx.title} provides excursions and outdoor adventures in ${ctx.parish || ctx.island}. ${ctx.avgRating ? `Rated ${ctx.avgRating}/5 by participants.` : ""}`.trim();
  },
  transfer: (ctx) => {
    return `${ctx.title} offers airport transfers and private transportation in ${ctx.island}. ${ctx.avgRating ? `Rated ${ctx.avgRating}/5 by travelers.` : ""}`.trim();
  },
  transport: (ctx) => {
    const cat = ctx.category || "vehicle rental";
    return `${ctx.title} provides ${cat.toLowerCase()} services in ${ctx.island}. ${ctx.avgRating ? `Rated ${ctx.avgRating}/5 by customers.` : ""}`.trim();
  },
  vip: (ctx) => {
    return `${ctx.title} provides premium VIP and concierge services in ${ctx.island}. ${ctx.avgRating ? `Rated ${ctx.avgRating}/5.` : ""}`.trim();
  },
  event: (ctx) => {
    return `${ctx.title} hosts events and experiences in ${ctx.parish || ctx.island}. ${ctx.avgRating ? `Rated ${ctx.avgRating}/5 by attendees.` : ""}`.trim();
  },
  guide: (ctx) => {
    return `${ctx.title} offers local guide services in ${ctx.island}, providing personalized tours and insider knowledge. ${ctx.avgRating ? `Rated ${ctx.avgRating}/5.` : ""}`.trim();
  },
};

const HEADLINE_TEMPLATES: Record<string, (ctx: any) => string> = {
  stay: (ctx) => `${ctx.category || "Stay"} in ${ctx.parish || ctx.island}`,
  tour: (ctx) => `Tours & activities in ${ctx.parish || ctx.island}`,
  dining: (ctx) => `${ctx.category || "Dining"} in ${ctx.parish || ctx.island}`,
  excursion: (ctx) => `Adventures in ${ctx.parish || ctx.island}`,
  transfer: (ctx) => `Transfers in ${ctx.island}`,
  transport: (ctx) => `${ctx.category || "Rentals"} in ${ctx.island}`,
  vip: (ctx) => `VIP services in ${ctx.island}`,
  event: (ctx) => `Events in ${ctx.parish || ctx.island}`,
  guide: (ctx) => `Local guide in ${ctx.island}`,
};

function formatGoogleTypes(types: string[] | null, fallback: string): string {
  if (!types || types.length === 0) return fallback;
  const nice: Record<string, string> = {
    tourist_attraction: "sightseeing",
    travel_agency: "travel",
    point_of_interest: "",
    establishment: "",
    food: "dining",
    restaurant: "restaurant",
    cafe: "café",
    bar: "bar & nightlife",
    lodging: "lodging",
    car_rental: "car rental",
    spa: "spa & wellness",
    gym: "fitness",
    park: "nature & parks",
    museum: "cultural",
    church: "heritage",
    shopping_mall: "shopping",
    store: "shopping",
    night_club: "nightlife",
    casino: "casino & entertainment",
    campground: "camping",
    rv_park: "RV & camping",
  };
  const mapped = types
    .map((t) => nice[t])
    .filter((t) => t && t.length > 0);
  return mapped.length > 0 ? mapped.slice(0, 2).join(" & ") : fallback;
}

function simplifyHours(hours: string[] | null): string {
  if (!hours || hours.length === 0) return "";
  // Check if all days are the same
  const unique = [...new Set(hours.map((h) => h.replace(/^\w+:\s*/, "")))];
  if (unique.length === 1) {
    if (unique[0].includes("24 hours")) return "24/7";
    return unique[0];
  }
  return "";
}

function generateDescription(listing: any): EnrichResult {
  const td = listing.typeData || {};
  const ctx = {
    title: listing.title,
    type: listing.type,
    island: listing.island,
    parish: listing.parish,
    category: td.category,
    googleTypes: td.googleTypes,
    avgRating: listing.avgRating,
    hours: td.hours,
    website: td.website,
  };

  const template = TYPE_TEMPLATES[listing.type] || TYPE_TEMPLATES.tour;
  const headlineTemplate =
    HEADLINE_TEMPLATES[listing.type] || HEADLINE_TEMPLATES.tour;

  return {
    description: template(ctx),
    headline: headlineTemplate(ctx),
    source: "generated",
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const db = drizzle(neon(DATABASE_URL));

  const typeCondition = typeFilter ? sql`AND l.type = ${typeFilter}` : sql``;

  // Get listings with boilerplate descriptions
  const result = await db.execute(sql`
    SELECT l.id, l.title, l.type, l.parish, l.avg_rating as "avgRating",
      l.type_data as "typeData",
      i.name as island
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    WHERE l.status = 'active'
      AND (l.description IS NULL
           OR l.description = ''
           OR l.description LIKE '%claim it for free%'
           OR l.description LIKE '%Claim this listing%'
           OR l.headline LIKE 'Discover %')
      ${typeCondition}
    ORDER BY l.avg_rating DESC NULLS LAST
    LIMIT ${limit}
  `);

  const listings = result.rows as any[];
  console.log(`Found ${listings.length} listings with boilerplate descriptions\n`);
  if (dryRun) console.log("=== DRY RUN ===\n");

  const sources = sourceFilter
    ? [sourceFilter]
    : ["google", "website", "generate"];

  console.log(`Sources: ${sources.join(", ")}`);
  console.log(`Concurrency: ${concurrency}\n`);

  const stats: Record<string, number> = {
    google: 0,
    website: 0,
    generated: 0,
    skipped: 0,
  };

  for (let i = 0; i < listings.length; i += concurrency) {
    const batch = listings.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing: any) => {
        const td = listing.typeData || {};
        let result: EnrichResult | null = null;

        // 1. Google Places editorial summary
        if (sources.includes("google") && td.googlePlaceId) {
          const googleDesc = await fetchGoogleDescription(td.googlePlaceId);
          if (googleDesc && googleDesc.length >= 30) {
            result = {
              description: googleDesc,
              headline:
                HEADLINE_TEMPLATES[listing.type]?.({
                  ...listing,
                  category: td.category,
                }) || `${listing.type} in ${listing.island}`,
              source: "google",
            };
          }
        }

        // 2. Website meta description
        if (!result && sources.includes("website") && td.website) {
          const webDesc = await fetchWebsiteDescription(td.website);
          if (webDesc && webDesc.length >= 30) {
            result = {
              description: webDesc,
              headline:
                HEADLINE_TEMPLATES[listing.type]?.({
                  ...listing,
                  category: td.category,
                }) || `${listing.type} in ${listing.island}`,
              source: "website",
            };
          }
        }

        // 3. Generate from data
        if (!result && sources.includes("generate")) {
          result = generateDescription(listing);
        }

        if (!result) {
          stats.skipped++;
          process.stdout.write("-");
          return;
        }

        stats[result.source] = (stats[result.source] || 0) + 1;

        if (dryRun) {
          if (result.source !== "generated") {
            console.log(`\n  [${result.source}] ${listing.title}:`);
            console.log(`    H: ${result.headline}`);
            console.log(`    D: ${result.description.substring(0, 120)}...`);
          }
          return;
        }

        await db.execute(sql`
          UPDATE listings
          SET description = ${result.description},
              headline = ${result.headline}
          WHERE id = ${listing.id}::uuid
        `);

        process.stdout.write(
          result.source === "google"
            ? "G"
            : result.source === "website"
              ? "W"
              : "."
        );
      })
    );

    await new Promise((r) => setTimeout(r, 300));

    if ((i + concurrency) % 100 < concurrency) {
      console.log(
        `\n[${Math.min(i + concurrency, listings.length)}/${listings.length}] G:${stats.google} W:${stats.website} Gen:${stats.generated} Skip:${stats.skipped}`
      );
    }
  }

  console.log(`\n\n=== DESCRIPTION ENRICHMENT COMPLETE ===`);
  console.log(`Google editorial: ${stats.google}`);
  console.log(`Website scraped:  ${stats.website}`);
  console.log(`Generated:        ${stats.generated}`);
  console.log(`Skipped:          ${stats.skipped}`);
}

main().catch(console.error);
