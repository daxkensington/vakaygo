/**
 * Audit listing descriptions for accuracy issues.
 *
 * Checks:
 * 1. Empty / near-empty descriptions (<50 chars)
 * 2. Duplicate descriptions shared across multiple listings
 * 3. Wrong-island mentions (desc says "Grenada" but listing is on Aruba)
 * 4. Type mismatches (stay vocabulary in a dining desc, etc)
 * 5. Generic AI-slop patterns ("Experience the magic of...",
 *    "Discover the wonders of...", "Perfect for any occasion...",
 *    zero specific detail)
 * 6. Wrong-business descriptions (title talks about hotel but desc
 *    describes beach/landmark)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/audit-descriptions.ts
 * Options:
 *   --limit=N        Audit only N listings (default: all active)
 *   --json           Emit JSON instead of human report (for consolidation)
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 0;
const asJson = args.includes("--json");

type Row = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  island_name: string;
  island_slug: string;
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

const CARIBBEAN_ISLANDS = [
  "grenada", "barbados", "jamaica", "trinidad", "tobago", "st. lucia", "st lucia",
  "aruba", "bahamas", "curacao", "curaçao", "antigua", "dominica", "dominican republic",
  "puerto rico", "cayman", "usvi", "turks", "caicos", "st. kitts", "st kitts",
  "nevis", "martinique", "guadeloupe", "st. vincent", "st vincent", "bonaire",
  "bvi", "british virgin",
];

// Sibling islands often share services legitimately (ferries,
// charters, taxi networks). Mentioning the sibling in a description
// isn't a bug — skip the wrong-island flag when pairs are linked.
const SIBLING_ISLANDS: Record<string, string[]> = {
  "us-virgin-islands": ["bvi", "british virgin"],
  "british-virgin-islands": ["usvi"],
  "trinidad-and-tobago": ["trinidad", "tobago"],
  "st-kitts": ["nevis"],
  "st-vincent": ["grenadines"],
  "turks-and-caicos": ["turks", "caicos"],
};

// Vocabulary fingerprints per listing type. If a description hits terms
// from the WRONG type more than its own type, it's probably mislabeled
// content.
const TYPE_VOCAB: Record<string, { own: string[]; conflicting: string[] }> = {
  stay: {
    own: ["room", "bed", "night", "suite", "villa", "apartment", "check-in", "check in", "wifi", "pool", "kitchen"],
    conflicting: [], // stays can talk about anything
  },
  dining: {
    own: ["menu", "dish", "cuisine", "chef", "food", "restaurant", "meal", "dinner", "lunch", "breakfast", "cocktail", "wine"],
    conflicting: ["per night", "bedroom", "check-in", "accommodation"],
  },
  tour: {
    own: ["tour", "guide", "excursion", "sightseeing", "itinerary", "visit", "explore", "attractions", "history"],
    conflicting: ["per night", "bedroom", "check-in"],
  },
  excursion: {
    own: ["excursion", "boat", "snorkel", "dive", "sail", "beach", "island hop", "cruise", "catamaran", "kayak"],
    conflicting: ["per night", "bedroom", "accommodation"],
  },
  event: {
    own: ["event", "festival", "party", "fete", "celebration", "tickets", "doors open", "lineup", "dj"],
    conflicting: ["per night", "bedroom"],
  },
  transport: {
    own: ["rental", "car", "vehicle", "taxi", "transport", "ride", "driver", "per day", "mileage"],
    conflicting: ["per night", "bedroom", "menu", "dish"],
  },
  transfer: {
    own: ["transfer", "airport", "pickup", "drop-off", "dropoff", "shuttle", "meet and greet", "flight"],
    conflicting: ["per night", "bedroom", "menu"],
  },
  vip: {
    own: ["vip", "concierge", "luxury", "private", "chauffeur", "security", "bespoke", "exclusive"],
    conflicting: [],
  },
  guide: {
    own: ["local guide", "local expert", "personal guide", "itinerary", "insider"],
    conflicting: [],
  },
  spa: {
    own: ["spa", "massage", "wellness", "treatment", "therapist", "sauna", "facial", "relax"],
    conflicting: ["per night", "menu", "dish"],
  },
};

// Generic slop patterns — phrases that appear in AI-generated, content-
// free descriptions. More hits => more generic.
const SLOP_PATTERNS = [
  /experience the (magic|wonder|beauty) of/i,
  /discover the (wonders|beauty|charm) of/i,
  /perfect for (any|every|all) occasion/i,
  /immerse yourself in/i,
  /a place where memories are made/i,
  /something for everyone/i,
  /unforgettable experience/i,
  /one of (the best|a kind)/i,
  /whether you'?re looking for/i,
  /nestled in/i,
  /offers a (unique|wide|diverse) (range|variety|selection) of/i,
  /a must[- ]visit/i,
  /breathtaking views/i,
  /top[- ]rated/i,
];

function slopScore(s: string): number {
  let hits = 0;
  for (const rx of SLOP_PATTERNS) if (rx.test(s)) hits++;
  return hits;
}

function normalizeForDup(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

async function main() {
  const sql = neon(DATABASE_URL);
  const issues: Issue[] = [];

  const listings = (await sql`
    SELECT l.id::text as id, l.title, l.type::text as type, l.description,
           i.name as island_name, i.slug as island_slug
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    WHERE l.status = 'active'
    ORDER BY l.id
    ${limit > 0 ? sql`LIMIT ${limit}` : sql``}
  `) as unknown as Row[];

  if (!asJson) console.error(`Auditing ${listings.length} descriptions...\n`);

  // --- Check 1: Empty / near-empty ---
  let emptyCount = 0;
  for (const l of listings) {
    const d = (l.description || "").trim();
    if (d.length < 50) {
      emptyCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type: l.type,
        island: l.island_name,
        issue: "empty-desc",
        detail: `Description is ${d.length} chars`,
        severity: "medium",
      });
    }
  }

  // --- Check 2: Duplicate descriptions across listings ---
  const dupMap = new Map<string, Row[]>();
  for (const l of listings) {
    const d = (l.description || "").trim();
    if (d.length < 100) continue;
    const key = normalizeForDup(d);
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key)!.push(l);
  }
  let dupCount = 0;
  for (const [, group] of dupMap) {
    if (group.length > 1) {
      for (const l of group) {
        dupCount++;
        issues.push({
          listingId: l.id,
          title: l.title,
          type: l.type,
          island: l.island_name,
          issue: "duplicate-desc",
          detail: `Same description shared by ${group.length} listings (e.g., "${group.filter((g) => g.id !== l.id)[0]?.title ?? ""}")`,
          severity: "high",
        });
      }
    }
  }

  // --- Check 3: Wrong island in description ---
  let wrongIslandCount = 0;
  for (const l of listings) {
    const d = (l.description || "").toLowerCase();
    if (d.length < 50) continue;
    const ownSlug = l.island_slug.toLowerCase().replace(/[-_]/g, " ");
    const ownName = l.island_name.toLowerCase();
    const hitsOwn = d.includes(ownName) || d.includes(ownSlug);
    const siblings = SIBLING_ISLANDS[l.island_slug.toLowerCase()] || [];
    const wrongHits = CARIBBEAN_ISLANDS.filter((isl) => {
      if (ownName.includes(isl) || ownSlug.includes(isl)) return false;
      // Sibling islands (USVI↔BVI etc) share services legitimately;
      // mentioning them is not a bug.
      if (siblings.some((s) => isl.includes(s) || s.includes(isl))) return false;
      // Word-boundary match so "aruba" doesn't match inside "arubabcd".
      const rx = new RegExp("\\b" + isl.replace(/\./g, "\\.") + "\\b");
      return rx.test(d);
    });
    if (wrongHits.length && !hitsOwn) {
      wrongIslandCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type: l.type,
        island: l.island_name,
        issue: "wrong-island-mention",
        detail: `Desc mentions ${wrongHits.slice(0, 3).join(", ")} but listing is on ${l.island_name}`,
        severity: "high",
      });
    }
  }

  // --- Check 4: Type mismatch (conflicting-type vocabulary) ---
  let typeMismatchCount = 0;
  for (const l of listings) {
    const d = (l.description || "").toLowerCase();
    if (d.length < 50) continue;
    const vocab = TYPE_VOCAB[l.type];
    if (!vocab) continue;
    const conflictingHits = vocab.conflicting.filter((term) =>
      d.includes(term.toLowerCase()),
    );
    if (conflictingHits.length >= 2) {
      typeMismatchCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type: l.type,
        island: l.island_name,
        issue: "type-vocab-mismatch",
        detail: `${l.type} listing desc uses: ${conflictingHits.join(", ")}`,
        severity: "medium",
      });
    }
  }

  // --- Check 5: Generic AI-slop ---
  let slopCount = 0;
  for (const l of listings) {
    const d = l.description || "";
    if (d.length < 50) continue;
    const score = slopScore(d);
    // 3+ slop phrases in one description = almost certainly generic
    if (score >= 3) {
      slopCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type: l.type,
        island: l.island_name,
        issue: "generic-slop",
        detail: `${score} generic phrases found`,
        severity: score >= 5 ? "high" : "low",
      });
    }
  }

  // --- Check 6: Title vs desc subject mismatch (quick heuristic) ---
  // If the title contains distinctive words (not generic like "the",
  // "hotel", "restaurant") and none of them appear in the description,
  // the desc is probably not actually about this business.
  const STOPWORDS = new Set([
    "the", "and", "of", "in", "at", "a", "an", "on", "to", "for", "by",
    "hotel", "resort", "restaurant", "cafe", "café", "bar", "grill",
    "inn", "lodge", "villa", "spa", "tour", "tours", "rental",
    "rentals", "services", "service", "taxi", "transport", "grenada",
    "barbados", "jamaica", "aruba", "bahamas",
  ]);
  let titleMismatchCount = 0;
  for (const l of listings) {
    const d = (l.description || "").toLowerCase();
    if (d.length < 100) continue;
    const titleWords = l.title
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    if (titleWords.length < 2) continue;
    const hits = titleWords.filter((w) => d.includes(w));
    // If none of the distinctive title words appear in a long desc,
    // the desc probably isn't about this specific listing.
    if (hits.length === 0) {
      titleMismatchCount++;
      issues.push({
        listingId: l.id,
        title: l.title,
        type: l.type,
        island: l.island_name,
        issue: "title-desc-subject-mismatch",
        detail: `Desc (${d.length} chars) shares no distinctive words with title: [${titleWords.slice(0, 4).join(", ")}]`,
        severity: "high",
      });
    }
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(issues));
    return;
  }

  // Human report
  console.log(`\n========== DESCRIPTION AUDIT ==========\n`);
  console.log(`Listings audited:        ${listings.length}`);
  console.log(`Empty / near-empty:      ${emptyCount}`);
  console.log(`Duplicate descriptions:  ${dupCount}`);
  console.log(`Wrong-island mentions:   ${wrongIslandCount}`);
  console.log(`Type vocab mismatches:   ${typeMismatchCount}`);
  console.log(`Generic slop (≥3 hits):  ${slopCount}`);
  console.log(`Title/desc mismatches:   ${titleMismatchCount}`);
  console.log(`Total issues:            ${issues.length}\n`);

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
