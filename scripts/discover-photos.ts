/**
 * Multi-source photo discovery for listings
 *
 * Cascades through real photo sources for each listing:
 * 1. Google Places (refresh photo_references)
 * 2. Business website (og:image, twitter:image, favicon, hero images)
 * 3. Facebook page search (cover photo, profile photo)
 * 4. Yelp Fusion API (business photos)
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/discover-photos.ts
 * Options:
 *   --limit=100        Process N listings (default 100)
 *   --type=dining      Only process specific listing type
 *   --source=website   Only try a specific source (google|website|facebook|yelp)
 *   --min-photos=1     Only process listings with fewer than N non-google photos
 *   --concurrency=3    Parallel requests (default 3)
 *   --dry-run          Show what would be fetched
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const YELP_API_KEY = process.env.YELP_API_KEY || "";

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const a = args.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const limit = parseInt(getArg("limit") || "100");
const typeFilter = getArg("type");
const sourceFilter = getArg("source");
const minPhotos = parseInt(getArg("min-photos") || "1");
const concurrency = parseInt(getArg("concurrency") || "3");
const dryRun = args.includes("--dry-run");

// ── Source: Google Places ──────────────────────────────────────────────

async function fetchGooglePhotos(
  placeId: string
): Promise<{ url: string; source: string }[]> {
  if (!GOOGLE_API_KEY) return [];
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.status !== "OK" || !data.result?.photos) return [];

    return data.result.photos.slice(0, 5).map((p: any) => ({
      url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}`,
      source: "google",
    }));
  } catch {
    return [];
  }
}

// ── Source: Website meta tags ──────────────────────────────────────────

async function fetchWebsiteImages(
  websiteUrl: string
): Promise<{ url: string; source: string }[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VakayGoBot/1.0; +https://vakaygo.com)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const html = await res.text();
    const images: { url: string; source: string }[] = [];
    const baseUrl = new URL(websiteUrl).origin;

    // Extract og:image
    const ogMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    ) || html.match(
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i
    );
    if (ogMatch?.[1]) {
      images.push({
        url: resolveUrl(ogMatch[1], baseUrl),
        source: "website-og",
      });
    }

    // Extract twitter:image
    const twMatch = html.match(
      /<meta[^>]*(?:name|property)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
    ) || html.match(
      /<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']twitter:image["']/i
    );
    if (twMatch?.[1]) {
      const twUrl = resolveUrl(twMatch[1], baseUrl);
      if (!images.some((i) => i.url === twUrl)) {
        images.push({ url: twUrl, source: "website-twitter" });
      }
    }

    // Extract structured data images (JSON-LD)
    const jsonLdMatches = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const m of jsonLdMatches) {
      try {
        const ld = JSON.parse(m[1]);
        const ldImage = ld.image || ld.logo;
        if (typeof ldImage === "string") {
          const ldUrl = resolveUrl(ldImage, baseUrl);
          if (!images.some((i) => i.url === ldUrl)) {
            images.push({ url: ldUrl, source: "website-jsonld" });
          }
        } else if (Array.isArray(ldImage)) {
          for (const img of ldImage.slice(0, 3)) {
            const u = typeof img === "string" ? img : img?.url;
            if (u) {
              const ldUrl = resolveUrl(u, baseUrl);
              if (!images.some((i) => i.url === ldUrl)) {
                images.push({ url: ldUrl, source: "website-jsonld" });
              }
            }
          }
        }
      } catch {}
    }

    return images;
  } catch {
    return [];
  }
}

function resolveUrl(url: string, base: string): string {
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

// ── Source: Facebook page search ──────────────────────────────────────

async function fetchFacebookImages(
  businessName: string,
  latitude?: number | null,
  longitude?: number | null
): Promise<{ url: string; source: string }[]> {
  // Use Facebook's public page search via Google to find the page
  // Then extract og:image from the Facebook page
  try {
    const query = encodeURIComponent(`${businessName} site:facebook.com`);
    const res = await fetch(
      `https://www.google.com/search?q=${query}&num=1`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }
    );
    if (!res.ok) return [];
    const html = await res.text();

    // Find Facebook URL in search results
    const fbMatch = html.match(
      /https:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/
    );
    if (!fbMatch) return [];

    const fbUrl = fbMatch[0];
    // Fetch the Facebook page to get og:image
    const fbRes = await fetch(fbUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    if (!fbRes.ok) return [];
    const fbHtml = await fbRes.text();

    const images: { url: string; source: string }[] = [];

    const ogMatch = fbHtml.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    );
    if (ogMatch?.[1] && !ogMatch[1].includes("static.xx.fbcdn")) {
      images.push({ url: ogMatch[1], source: "facebook" });
    }

    return images;
  } catch {
    return [];
  }
}

// ── Source: Yelp Fusion API ───────────────────────────────────────────

async function fetchYelpPhotos(
  businessName: string,
  latitude?: number | null,
  longitude?: number | null
): Promise<{ url: string; source: string }[]> {
  if (!YELP_API_KEY) return [];
  try {
    const params = new URLSearchParams({ term: businessName, limit: "1" });
    if (latitude && longitude) {
      params.set("latitude", String(latitude));
      params.set("longitude", String(longitude));
    }

    const res = await fetch(
      `https://api.yelp.com/v3/businesses/search?${params}`,
      { headers: { Authorization: `Bearer ${YELP_API_KEY}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();

    const biz = data.businesses?.[0];
    if (!biz?.image_url) return [];

    // Yelp image_url is the main photo; we can also get the photos endpoint
    const images: { url: string; source: string }[] = [];

    // Get the main business image (high quality by modifying the URL)
    const hiRes = biz.image_url.replace(/\/ms\.jpg$/, "/o.jpg");
    images.push({ url: hiRes, source: "yelp" });

    // Try to get additional photos from the business detail endpoint
    if (biz.id) {
      try {
        const detailRes = await fetch(
          `https://api.yelp.com/v3/businesses/${biz.id}`,
          { headers: { Authorization: `Bearer ${YELP_API_KEY}` } }
        );
        if (detailRes.ok) {
          const detail = await detailRes.json();
          if (detail.photos) {
            for (const photoUrl of detail.photos.slice(0, 3)) {
              const url = photoUrl.replace(/\/ms\.jpg$/, "/o.jpg");
              if (!images.some((i) => i.url === url)) {
                images.push({ url, source: "yelp" });
              }
            }
          }
        }
      } catch {}
    }

    return images;
  } catch {
    return [];
  }
}

// ── Validate image URL ────────────────────────────────────────────────

async function validateImage(url: string): Promise<boolean> {
  // Skip validation for Google Places URLs (they need API key appended at proxy time)
  if (url.includes("googleapis.com")) return true;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VakayGoBot/1.0; +https://vakaygo.com)",
      },
      redirect: "follow",
    });
    const ct = res.headers.get("content-type") || "";
    return res.ok && ct.startsWith("image/");
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const db = drizzle(neon(DATABASE_URL));

  // Find listings that need more photos
  const typeCondition = typeFilter ? sql`AND l.type = ${typeFilter}` : sql``;
  const result = await db.execute(sql`
    SELECT
      l.id, l.title, l.type, l.address, l.latitude, l.longitude,
      l.type_data as "typeData",
      COUNT(CASE WHEN m.url NOT LIKE '%googleapis.com%' THEN 1 END) as reliable_photos
    FROM listings l
    LEFT JOIN media m ON m.listing_id = l.id
    WHERE l.status = 'active'
      ${typeCondition}
    GROUP BY l.id
    HAVING COUNT(CASE WHEN m.url NOT LIKE '%googleapis.com%' THEN 1 END) < ${minPhotos}
    ORDER BY COUNT(m.id) ASC
    LIMIT ${limit}
  `);

  const listingsToProcess = result.rows as any[];
  console.log(`Found ${listingsToProcess.length} listings needing photos (min-photos=${minPhotos})\n`);

  if (dryRun) console.log("=== DRY RUN ===\n");

  const sources = sourceFilter
    ? [sourceFilter]
    : ["google", "website", "facebook", "yelp"];

  console.log(`Sources: ${sources.join(", ")}`);
  console.log(`Concurrency: ${concurrency}\n`);

  const stats = {
    google: 0,
    "website-og": 0,
    "website-twitter": 0,
    "website-jsonld": 0,
    facebook: 0,
    yelp: 0,
    failed: 0,
    skipped: 0,
  };

  // Process in batches
  for (let i = 0; i < listingsToProcess.length; i += concurrency) {
    const batch = listingsToProcess.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing: any) => {
        const td = (listing.typeData || {}) as Record<string, any>;
        const placeId = td.googlePlaceId;
        const website = td.website;
        let newPhotos: { url: string; source: string }[] = [];

        // 1. Google Places
        if (sources.includes("google") && placeId && newPhotos.length === 0) {
          const googlePhotos = await fetchGooglePhotos(placeId);
          if (googlePhotos.length > 0) {
            // Replace stale google photos
            if (!dryRun) {
              await db.execute(
                sql`DELETE FROM media WHERE listing_id = ${listing.id}::uuid AND url LIKE '%googleapis.com%'`
              );
            }
            newPhotos.push(...googlePhotos);
          }
        }

        // 2. Website scraping
        if (sources.includes("website") && website) {
          const webPhotos = await fetchWebsiteImages(website);
          for (const photo of webPhotos) {
            if (await validateImage(photo.url)) {
              newPhotos.push(photo);
            }
          }
        }

        // 3. Facebook
        if (sources.includes("facebook") && newPhotos.length < 3) {
          const fbPhotos = await fetchFacebookImages(
            listing.title,
            listing.latitude,
            listing.longitude
          );
          for (const photo of fbPhotos) {
            if (await validateImage(photo.url)) {
              newPhotos.push(photo);
            }
          }
        }

        // 4. Yelp
        if (
          sources.includes("yelp") &&
          YELP_API_KEY &&
          newPhotos.filter((p) => p.source !== "google").length < 2
        ) {
          const yelpPhotos = await fetchYelpPhotos(
            listing.title,
            listing.latitude,
            listing.longitude
          );
          for (const photo of yelpPhotos) {
            if (await validateImage(photo.url)) {
              newPhotos.push(photo);
            }
          }
        }

        if (newPhotos.length === 0) {
          stats.skipped++;
          process.stdout.write("-");
          return;
        }

        if (dryRun) {
          console.log(
            `\n  ${listing.title}: ${newPhotos.map((p) => p.source).join(", ")}`
          );
          for (const p of newPhotos) stats[p.source as keyof typeof stats]++;
          return;
        }

        // Determine if we need a new primary
        const existingPrimary = await db.execute(
          sql`SELECT id FROM media WHERE listing_id = ${listing.id}::uuid AND is_primary = true AND url NOT LIKE '%googleapis.com%' LIMIT 1`
        );
        const needsPrimary = existingPrimary.rows.length === 0;

        // Insert new photos
        for (let j = 0; j < newPhotos.length; j++) {
          const photo = newPhotos[j];
          const isPrimary = needsPrimary && j === 0;
          const source = photo.source;

          await db.execute(sql`
            INSERT INTO media (listing_id, url, alt, type, sort_order, is_primary)
            VALUES (${listing.id}::uuid, ${photo.url}, ${listing.title}, 'image', ${j}, ${isPrimary})
          `);

          stats[source as keyof typeof stats] =
            (stats[source as keyof typeof stats] || 0) + 1;
        }

        process.stdout.write(".");
      })
    );

    // Rate limiting between batches
    await new Promise((r) => setTimeout(r, 500));

    // Progress log every 50
    if ((i + concurrency) % 50 < concurrency) {
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      console.log(
        `\n[${Math.min(i + concurrency, listingsToProcess.length)}/${listingsToProcess.length}] ` +
          `G:${stats.google} W:${stats["website-og"] + stats["website-twitter"] + stats["website-jsonld"]} ` +
          `FB:${stats.facebook} Y:${stats.yelp} skip:${stats.skipped}`
      );
    }
  }

  console.log(`\n\n=== Complete ===`);
  console.log(`Google Places:  ${stats.google} photos`);
  console.log(`Website OG:     ${stats["website-og"]} photos`);
  console.log(`Website Twitter:${stats["website-twitter"]} photos`);
  console.log(`Website JSON-LD:${stats["website-jsonld"]} photos`);
  console.log(`Facebook:       ${stats.facebook} photos`);
  console.log(`Yelp:           ${stats.yelp} photos`);
  console.log(`Skipped:        ${stats.skipped}`);
  console.log(`Failed:         ${stats.failed}`);
}

main().catch(console.error);
