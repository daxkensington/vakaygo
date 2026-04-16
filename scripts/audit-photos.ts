/**
 * Audit listing photos against Google Places data
 *
 * Checks:
 * 1. Google Place name matches our listing title (flags mismatches)
 * 2. Dead/expired image URLs (imgen.x.ai temp URLs, 404s)
 * 3. Listings with only Google photos (no reliable backup)
 * 4. Generic/non-business listings (beaches, countries, landmarks listed as businesses)
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/audit-photos.ts
 * Options:
 *   --limit=500       Audit N listings (default 500)
 *   --fix             Actually fix issues (default: report only)
 *   --check-urls      HEAD-check non-Google image URLs for 404s
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
const doFix = args.includes("--fix");
const checkUrls = args.includes("--check-urls");

interface AuditIssue {
  listingId: string;
  title: string;
  type: string;
  island: string;
  issue: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);

  // Exact match
  if (na === nb) return 1.0;

  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  // Word overlap
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  const jaccard = intersection.length / union.size;

  return jaccard;
}

async function getPlaceName(
  placeId: string
): Promise<{ name: string; types: string[] } | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,types&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.status !== "OK") return null;
    return {
      name: data.result.name || "",
      types: data.result.types || [],
    };
  } catch {
    return null;
  }
}

async function checkImageUrl(url: string): Promise<boolean> {
  // Skip Google Places URLs (they need proxy key)
  if (url.includes("googleapis.com")) return true;
  // imgen.x.ai URLs are temp and expire
  if (url.includes("imgen.x.ai")) return false;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VakayGoBot/1.0; +https://vakaygo.com)",
      },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Google types that indicate non-business POIs
const NON_BUSINESS_TYPES = [
  "natural_feature",
  "locality",
  "sublocality",
  "country",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "colloquial_area",
];

async function main() {
  const db = drizzle(neon(DATABASE_URL));
  const issues: AuditIssue[] = [];

  // 1. Get listings with their media info
  const result = await db.execute(sql`
    SELECT
      l.id, l.title, l.type, l.address,
      l.type_data as "typeData",
      i.name as island,
      json_agg(json_build_object(
        'url', m.url,
        'isPrimary', m.is_primary,
        'source', CASE
          WHEN m.url LIKE '%googleapis.com%' THEN 'google'
          WHEN m.url LIKE '%imgen.x.ai%' THEN 'grok-temp'
          WHEN m.url LIKE '/images/%' THEN 'local'
          ELSE 'external'
        END
      )) as media
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    LEFT JOIN media m ON m.listing_id = l.id
    WHERE l.status = 'active'
    GROUP BY l.id, i.name
    ORDER BY random()
    LIMIT ${limit}
  `);

  const listings = result.rows as any[];
  console.log(`Auditing ${listings.length} listings...\n`);

  // === Check 1: Expired Grok temp URLs ===
  console.log("--- Check 1: Expired temp URLs ---");
  let tempUrlCount = 0;
  for (const listing of listings) {
    const media = listing.media || [];
    const tempUrls = media.filter(
      (m: any) => m.source === "grok-temp"
    );
    if (tempUrls.length > 0) {
      tempUrlCount++;
      issues.push({
        listingId: listing.id,
        title: listing.title,
        type: listing.type,
        island: listing.island,
        issue: "expired-temp-url",
        detail: `${tempUrls.length} Grok temp URL(s) that will/have expired`,
        severity: "high",
      });
    }
  }
  console.log(`  ${tempUrlCount} listings with temp Grok URLs\n`);

  // === Check 2: Listings with ONLY Google photos (no reliable backup) ===
  console.log("--- Check 2: Only Google photos (no backup) ---");
  let googleOnlyCount = 0;
  for (const listing of listings) {
    const media = listing.media || [];
    const nonGoogle = media.filter(
      (m: any) => m.source !== "google" && m.url
    );
    if (nonGoogle.length === 0 && media.length > 0) {
      googleOnlyCount++;
      // Only flag as medium — Google photos work but may expire
    }
  }
  console.log(`  ${googleOnlyCount} listings with only Google photos\n`);

  // === Check 3: Name mismatch with Google Places ===
  if (GOOGLE_API_KEY) {
    console.log("--- Check 3: Name verification (sampling 100) ---");
    const sample = listings
      .filter((l: any) => l.typeData?.googlePlaceId)
      .slice(0, 100);

    let checked = 0;
    let mismatches = 0;
    let nonBusiness = 0;

    for (const listing of sample) {
      const placeId = listing.typeData.googlePlaceId;
      const placeData = await getPlaceName(placeId);

      if (placeData) {
        const sim = similarity(listing.title, placeData.name);

        if (sim < 0.3) {
          mismatches++;
          issues.push({
            listingId: listing.id,
            title: listing.title,
            type: listing.type,
            island: listing.island,
            issue: "name-mismatch",
            detail: `Ours: "${listing.title}" vs Google: "${placeData.name}" (similarity: ${(sim * 100).toFixed(0)}%)`,
            severity: "high",
          });
        }

        // Check if it's a non-business POI
        const isNonBusiness = placeData.types.some((t: string) =>
          NON_BUSINESS_TYPES.includes(t)
        );
        if (isNonBusiness) {
          nonBusiness++;
          issues.push({
            listingId: listing.id,
            title: listing.title,
            type: listing.type,
            island: listing.island,
            issue: "non-business-poi",
            detail: `Google types: ${placeData.types.join(", ")} — likely a landmark/area, not a business`,
            severity: "medium",
          });
        }
      }

      checked++;
      if (checked % 20 === 0)
        console.log(`  Checked ${checked}/${sample.length}...`);

      // Rate limit
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`  ${mismatches} name mismatches out of ${checked} checked`);
    console.log(`  ${nonBusiness} non-business POIs\n`);
  }

  // === Check 4: Dead external URLs ===
  if (checkUrls) {
    console.log("--- Check 4: Dead external URLs ---");
    let deadCount = 0;
    let checkedUrls = 0;

    for (const listing of listings) {
      const media = listing.media || [];
      for (const m of media) {
        if (m.source === "external" || m.source === "grok-temp") {
          const alive = await checkImageUrl(m.url);
          checkedUrls++;
          if (!alive) {
            deadCount++;
            issues.push({
              listingId: listing.id,
              title: listing.title,
              type: listing.type,
              island: listing.island,
              issue: "dead-url",
              detail: `Dead: ${m.url.substring(0, 80)}...`,
              severity: "high",
            });
          }
          if (checkedUrls % 50 === 0)
            console.log(`  Checked ${checkedUrls} URLs...`);
        }
      }
    }
    console.log(`  ${deadCount} dead URLs out of ${checkedUrls} checked\n`);
  }

  // === Report ===
  console.log("\n========== AUDIT REPORT ==========\n");

  const high = issues.filter((i) => i.severity === "high");
  const medium = issues.filter((i) => i.severity === "medium");
  const low = issues.filter((i) => i.severity === "low");

  console.log(`HIGH severity:   ${high.length}`);
  console.log(`MEDIUM severity: ${medium.length}`);
  console.log(`LOW severity:    ${low.length}`);
  console.log(`TOTAL issues:    ${issues.length}\n`);

  // Group by issue type
  const byType: Record<string, AuditIssue[]> = {};
  for (const issue of issues) {
    if (!byType[issue.issue]) byType[issue.issue] = [];
    byType[issue.issue].push(issue);
  }

  for (const [type, typeIssues] of Object.entries(byType)) {
    console.log(`\n--- ${type} (${typeIssues.length}) ---`);
    for (const issue of typeIssues.slice(0, 20)) {
      console.log(
        `  [${issue.severity}] ${issue.title} (${issue.island}, ${issue.type})`
      );
      console.log(`         ${issue.detail}`);
    }
    if (typeIssues.length > 20) {
      console.log(`  ... and ${typeIssues.length - 20} more`);
    }
  }

  // === Fix mode ===
  if (doFix) {
    console.log("\n\n========== FIXING ISSUES ==========\n");

    // Fix: Delete expired Grok temp URLs
    const tempUrlIssues = byType["expired-temp-url"] || [];
    if (tempUrlIssues.length > 0) {
      console.log(
        `Deleting ${tempUrlIssues.length} expired Grok temp image records...`
      );
      for (const issue of tempUrlIssues) {
        await db.execute(sql`
          DELETE FROM media
          WHERE listing_id = ${issue.listingId}::uuid
          AND url LIKE '%imgen.x.ai%'
        `);
      }
      console.log("  Done.\n");
    }

    // Fix: Delete dead URL records
    const deadUrlIssues = byType["dead-url"] || [];
    if (deadUrlIssues.length > 0) {
      console.log(
        `Deleting ${deadUrlIssues.length} dead URL image records...`
      );
      for (const issue of deadUrlIssues) {
        const urlPrefix = issue.detail
          .replace("Dead: ", "")
          .replace("...", "");
        await db.execute(sql`
          DELETE FROM media
          WHERE listing_id = ${issue.listingId}::uuid
          AND url LIKE ${urlPrefix + "%"}
        `);
      }
      console.log("  Done.\n");
    }
  }

  // Extrapolation
  const sampleSize = listings.length;
  const totalActive = 7118;
  const ratio = totalActive / sampleSize;
  console.log(`\n--- Extrapolation (sample ${sampleSize} / ${totalActive} total) ---`);
  for (const [type, typeIssues] of Object.entries(byType)) {
    const estimated = Math.round(typeIssues.length * ratio);
    console.log(`  ${type}: ~${estimated} estimated total`);
  }
}

main().catch(console.error);
