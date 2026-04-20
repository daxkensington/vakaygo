/**
 * Audit listing prices for accuracy issues.
 *
 * Checks:
 * 1. Missing price on types that usually have one (e.g., dining with a
 *    Google `price_level` but no `priceAmount`).
 * 2. Implausibly low values by type ($5 stay, $5 spa, $3 tour).
 * 3. Implausibly high values by type (>3σ above median, or absolute
 *    sanity cap e.g. $5,000 dining entree).
 * 4. `priceUnit` that doesn't match the type (dining priced per-night,
 *    stay priced per-person, transfer priced per-hour without context).
 * 5. Currency outliers — a site whose priced-listings are almost all
 *    USD/XCD with one lone listing in a random currency.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/audit-prices.ts
 * Options:
 *   --json           Emit JSON instead of human report
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const asJson = process.argv.includes("--json");

type Row = {
  id: string;
  title: string;
  type: string;
  island_name: string;
  price_amount: string | null;
  price_currency: string | null;
  price_unit: string | null;
  type_data: Record<string, unknown> | null;
};

type Issue = {
  listingId: string;
  title: string;
  type: string;
  island: string;
  issue: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

// Plausibility floors by type, in any reasonable currency. Anything
// below this is very likely a data error (missing decimal, wrong
// field, placeholder).
const FLOOR: Record<string, number> = {
  stay: 25,         // cheapest guesthouse/dorm
  tour: 10,
  excursion: 15,
  dining: 5,        // a coffee is ~$5
  event: 5,
  transport: 10,
  transfer: 15,
  vip: 50,
  guide: 30,
  spa: 25,
};

// Absolute sanity ceiling by type. Beyond this is almost always a
// data error or typo, not a real premium listing.
const CEIL: Record<string, number> = {
  stay: 5000,       // $5K/night = top-end resort
  tour: 2000,
  excursion: 2000,
  dining: 300,      // single meal
  event: 1000,
  transport: 1500,
  transfer: 500,
  vip: 5000,
  guide: 1000,
  spa: 500,
};

// Canonical per-type price unit. Descriptions use many phrasings, so
// we normalize them and check the stem matches.
const EXPECTED_UNIT: Record<string, string[]> = {
  stay: ["night"],
  tour: ["person", "group", "tour"],
  excursion: ["person", "group", "trip"],
  dining: ["person", "meal", "cover"],
  event: ["person", "ticket"],
  transport: ["day", "hour", "trip"],
  transfer: ["trip", "person", "way"],
  vip: ["hour", "day", "person", "trip"],
  guide: ["hour", "day", "person"],
  spa: ["treatment", "session", "person"],
};

function normalizeUnit(u: string | null): string {
  if (!u) return "";
  return u
    .toLowerCase()
    .replace(/^per[\s-]+/, "")
    .replace(/s$/, "")
    .trim();
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function mad(nums: number[], med: number): number {
  if (nums.length === 0) return 0;
  const devs = nums.map((n) => Math.abs(n - med));
  return median(devs);
}

async function main() {
  const sql = neon(DATABASE_URL);

  const listings = (await sql`
    SELECT l.id::text as id, l.title, l.type::text as type,
           l.price_amount::text as price_amount, l.price_currency, l.price_unit,
           l.type_data,
           i.name as island_name
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    WHERE l.status = 'active'
  `) as unknown as Row[];

  if (!asJson) console.error(`Auditing ${listings.length} prices...\n`);

  const issues: Issue[] = [];

  // Per-type stats for outlier detection (MAD is more robust than σ
  // when data has a fat tail).
  const byType: Record<string, number[]> = {};
  for (const l of listings) {
    const p = l.price_amount ? parseFloat(l.price_amount) : 0;
    if (p > 0) (byType[l.type] ||= []).push(p);
  }
  const stats: Record<string, { median: number; mad: number; n: number }> = {};
  for (const [t, arr] of Object.entries(byType)) {
    const m = median(arr);
    stats[t] = { median: m, mad: mad(arr, m) || m * 0.5, n: arr.length };
  }

  let outlierHighCount = 0;
  let outlierLowCount = 0;
  let floorCount = 0;
  let ceilCount = 0;
  let unitMismatchCount = 0;
  let missingWithSignalCount = 0;
  let currencyOutlierCount = 0;

  // Most-common currency per type (expected default)
  const currencyByType: Record<string, Record<string, number>> = {};
  for (const l of listings) {
    if (!l.price_amount || !l.price_currency) continue;
    (currencyByType[l.type] ||= {});
    currencyByType[l.type][l.price_currency] =
      (currencyByType[l.type][l.price_currency] || 0) + 1;
  }
  const dominantCurrency: Record<string, string> = {};
  for (const [t, m] of Object.entries(currencyByType)) {
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]);
    if (entries.length && entries[0][1] / listings.length > 0) {
      dominantCurrency[t] = entries[0][0];
    }
  }

  for (const l of listings) {
    const p = l.price_amount ? parseFloat(l.price_amount) : 0;
    const type = l.type;

    // --- Check 1: missing price but Google has a price_level ---
    const typeData = l.type_data || {};
    const priceLevel = (typeData as Record<string, unknown>).priceLevel ??
      (typeData as Record<string, unknown>).price_level;
    if (p <= 0 && priceLevel != null && priceLevel !== "") {
      missingWithSignalCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type,
        island: l.island_name,
        issue: "missing-price-with-signal",
        detail: `No price set, but Google price_level=${priceLevel} — should be populated`,
        severity: "medium",
      });
      continue;
    }

    if (p <= 0) continue; // rest of checks need a price

    // --- Check 2: below plausibility floor ---
    const floor = FLOOR[type];
    if (floor && p < floor) {
      floorCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type,
        island: l.island_name,
        issue: "implausibly-low",
        detail: `$${p} ${l.price_currency || ""} per ${l.price_unit || "?"} — floor for ${type} is $${floor}`,
        severity: "high",
      });
    }

    // --- Check 3: above ceiling ---
    const ceil = CEIL[type];
    if (ceil && p > ceil) {
      ceilCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type,
        island: l.island_name,
        issue: "implausibly-high",
        detail: `$${p} ${l.price_currency || ""} per ${l.price_unit || "?"} — ceiling for ${type} is $${ceil}`,
        severity: "high",
      });
    }

    // --- Check 4: statistical outlier (robust: MAD) ---
    const s = stats[type];
    if (s && s.n >= 20 && s.mad > 0) {
      // Robust z-score via MAD
      const z = Math.abs(p - s.median) / (1.4826 * s.mad);
      if (z > 4 && (p > ceil || p < floor)) {
        // Already caught by floor/ceiling; don't double-flag
      } else if (z > 5) {
        if (p > s.median) outlierHighCount++;
        else outlierLowCount++;
        issues.push({
          listingId: l.id,
          title: l.title,
          type,
          island: l.island_name,
          issue: "statistical-outlier",
          detail: `$${p} — ${z.toFixed(1)}x robust-σ from ${type} median $${s.median}`,
          severity: "medium",
        });
      }
    }

    // --- Check 5: price unit mismatch ---
    const normalizedUnit = normalizeUnit(l.price_unit);
    const expected = EXPECTED_UNIT[type] || [];
    if (normalizedUnit && expected.length > 0 && !expected.includes(normalizedUnit)) {
      // Allow "night" on stay (most common), also allow "hour" for most
      // flexible services. Only flag when the unit is clearly wrong for
      // the type — e.g. "night" on a dining listing.
      const clearlyWrong =
        (type === "dining" && normalizedUnit === "night") ||
        (type === "stay" && (normalizedUnit === "person" || normalizedUnit === "meal")) ||
        (type === "spa" && normalizedUnit === "night");
      if (clearlyWrong) {
        unitMismatchCount++;
        issues.push({
          listingId: l.id,
          title: l.title,
          type,
          island: l.island_name,
          issue: "unit-mismatch",
          detail: `${type} priced per "${l.price_unit}" — doesn't match type`,
          severity: "high",
        });
      }
    }

    // --- Check 6: lone currency outlier ---
    const dom = dominantCurrency[type];
    if (dom && l.price_currency && l.price_currency !== dom) {
      // Only flag if dominant is overwhelmingly common (>95%) — some
      // variance is normal for multi-currency listings.
      const total = Object.values(currencyByType[type]).reduce((a, b) => a + b, 0);
      const domCount = currencyByType[type][dom];
      if (domCount / total >= 0.95) {
        currencyOutlierCount++;
        issues.push({
          listingId: l.id,
          title: l.title,
          type,
          island: l.island_name,
          issue: "currency-outlier",
          detail: `Currency ${l.price_currency} — ${type} is overwhelmingly ${dom}`,
          severity: "low",
        });
      }
    }
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(issues));
    return;
  }

  console.log(`\n========== PRICE AUDIT ==========\n`);
  console.log(`Listings examined:              ${listings.length}`);
  console.log(`Missing price but has signal:   ${missingWithSignalCount}`);
  console.log(`Below plausibility floor:       ${floorCount}`);
  console.log(`Above plausibility ceiling:     ${ceilCount}`);
  console.log(`Statistical outliers:           ${outlierHighCount + outlierLowCount}`);
  console.log(`Unit mismatches:                ${unitMismatchCount}`);
  console.log(`Currency outliers:              ${currencyOutlierCount}`);
  console.log(`Total issues:                   ${issues.length}\n`);

  console.log(`Per-type medians (n priced):`);
  for (const [t, s] of Object.entries(stats)) {
    console.log(`  ${t.padEnd(10)} median=$${s.median.toString().padEnd(6)} MAD=$${s.mad.toFixed(1).padEnd(6)} n=${s.n}`);
  }

  const byIssue: Record<string, Issue[]> = {};
  for (const i of issues) {
    (byIssue[i.issue] ||= []).push(i);
  }
  for (const [k, v] of Object.entries(byIssue)) {
    console.log(`\n--- ${k} (${v.length}) — sample 10 ---`);
    for (const i of v.slice(0, 10)) {
      console.log(`  [${i.severity}] ${i.title} (${i.island}, ${i.type})`);
      console.log(`         ${i.detail}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
