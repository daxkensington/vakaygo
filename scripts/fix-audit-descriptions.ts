/**
 * Null out broken descriptions flagged by audit-descriptions.ts so that
 * the next enrich-descriptions.ts run (or the weekly enrich-listings
 * cron) regenerates them from real sources. Targets only the worst:
 * duplicates shared across listings and title/subject mismatches.
 *
 * Empty/near-empty (<50 chars) are left alone — they're already empty,
 * the enrich cron picks them up.
 *
 *   DATABASE_URL=... npx tsx scripts/fix-audit-descriptions.ts
 * Options:
 *   --dry-run        Report what would change, don't write
 *   --include-empty  Also null descs < 50 chars
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const dryRun = process.argv.includes("--dry-run");
const includeEmpty = process.argv.includes("--include-empty");

type Row = {
  id: string;
  title: string;
  type: string;
  description: string;
  island_name: string;
};

const STOPWORDS = new Set([
  "the", "and", "of", "in", "at", "a", "an", "on", "to", "for", "by",
  "hotel", "resort", "restaurant", "cafe", "café", "bar", "grill",
  "inn", "lodge", "villa", "spa", "tour", "tours", "rental",
  "rentals", "services", "service", "taxi", "transport",
]);

function normalizeForDup(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}

async function main() {
  const sql = neon(DATABASE_URL);

  const listings = (await sql`
    SELECT l.id::text as id, l.title, l.type::text as type,
           COALESCE(l.description, '') as description,
           i.name as island_name
    FROM listings l JOIN islands i ON i.id = l.island_id
    WHERE l.status = 'active'
  `) as unknown as Row[];

  // --- Build the "should be nulled" set ---
  const nullIds = new Set<string>();
  const reasons = new Map<string, string>();

  // 1. Duplicates (>= 2 listings share a >=100 char description)
  const dupMap = new Map<string, Row[]>();
  for (const l of listings) {
    if (l.description.length < 100) continue;
    const key = normalizeForDup(l.description);
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key)!.push(l);
  }
  let dupCount = 0;
  for (const group of dupMap.values()) {
    if (group.length > 1) {
      for (const l of group) {
        nullIds.add(l.id);
        reasons.set(l.id, `duplicate shared across ${group.length} listings`);
        dupCount++;
      }
    }
  }

  // 2. Title/desc subject mismatch (100+ char desc with zero distinctive
  //    title words appearing in it).
  let mismatchCount = 0;
  for (const l of listings) {
    if (nullIds.has(l.id)) continue;
    if (l.description.length < 100) continue;
    const titleWords = l.title
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    if (titleWords.length < 2) continue;
    const hits = titleWords.filter((w) => l.description.toLowerCase().includes(w));
    if (hits.length === 0) {
      nullIds.add(l.id);
      reasons.set(l.id, `title/subject mismatch — no distinctive title word in desc`);
      mismatchCount++;
    }
  }

  // 3. Optionally: empty
  let emptyCount = 0;
  if (includeEmpty) {
    for (const l of listings) {
      if (l.description.trim().length > 0 && l.description.trim().length < 50) {
        nullIds.add(l.id);
        reasons.set(l.id, `empty (${l.description.length} chars)`);
        emptyCount++;
      }
    }
  }

  console.log(`Would null ${nullIds.size} descriptions${dryRun ? " (dry-run)" : ""}`);
  console.log(`  duplicates:         ${dupCount}`);
  console.log(`  title mismatches:   ${mismatchCount}`);
  if (includeEmpty) console.log(`  near-empty:         ${emptyCount}`);

  if (dryRun) {
    console.log("\nSample:");
    let n = 0;
    for (const id of nullIds) {
      if (n++ >= 15) break;
      const l = listings.find((x) => x.id === id)!;
      console.log(`  ${l.title} (${l.island_name}) — ${reasons.get(id)}`);
    }
    return;
  }

  const ids = [...nullIds];
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    await sql`
      UPDATE listings
      SET description = NULL, updated_at = NOW()
      WHERE id = ANY(${slice}::uuid[])
    `;
    process.stdout.write(`  nulled ${Math.min(i + BATCH, ids.length)}/${ids.length}\r`);
  }
  console.log(`\nNulled ${ids.length} descriptions.`);
  console.log(`\nNext: run enrich-descriptions.ts (or wait for the weekly cron) to repopulate from real sources.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
