/**
 * Shared helpers for the listing data repair scripts in scripts/repair/.
 *
 * Every script is a DRY RUN unless `--apply` is passed:
 * - dry run: the database handle refuses anything but SELECT/WITH, and the
 *   script writes a plan file (what it would change, row by row);
 * - apply: the script first writes a backup of every row it is about to change
 *   (the full current row), then changes them inside one transaction.
 *
 * Files go to $REPAIR_OUT_DIR (default ./repair-output, git-ignored).
 *
 *   DATABASE_URL=... node scripts/repair/<script>.mjs            # plan only
 *   DATABASE_URL=... node scripts/repair/<script>.mjs --apply    # backup, then change
 */
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

export const APPLY = process.argv.includes("--apply");

export function arg(name) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const READ_ONLY = /^\s*(select|with|explain|show)\b/i;

/** A neon client; in a dry run every non-SELECT statement throws. */
export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const sql = neon(url);
  return {
    sql,
    async query(text, params = []) {
      if (!APPLY && !READ_ONLY.test(text)) throw new Error("dry run: refusing a write");
      return sql.query(text, params);
    },
    /** Runs the statements in one transaction (apply mode only). */
    async transaction(statements) {
      if (!APPLY) throw new Error("dry run: refusing a transaction");
      return sql.transaction(statements.map(([text, params]) => sql.query(text, params ?? [])));
    },
  };
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");

export function outputFile(script, kind, data) {
  const dir = process.env.REPAIR_OUT_DIR || path.join(process.cwd(), "repair-output");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${script}.${kind}.${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** Full current rows of `listings` for the given ids, for the backup file. */
export async function listingRows(db, ids) {
  if (!ids.length) return [];
  return db.query(`SELECT * FROM listings WHERE id = ANY($1::uuid[])`, [ids]);
}

export function summary(script, counts) {
  console.log(`\n${script}: ${APPLY ? "APPLY" : "DRY RUN (nothing written)"}`);
  for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`);
}

/**
 * Repair scripts change only directory records nobody owns: still marked
 * unclaimed and owned by the placeholder account. Claimed listings and
 * operator-created listings are never changed.
 */
export const CLAIMED_SQL = `(EXISTS(SELECT 1 FROM listing_onboarding n WHERE n.listing_id=l.id) OR vakaygo_listing_claim_verified(l.id)
  OR coalesce(l.type_data->>'unclaimed','') <> 'true'
  OR l.operator_id NOT IN (SELECT u.id FROM users u WHERE lower(u.email) IN ('unclaimed@vakaygo.com','demo@vakaygo.com')))`;

const STOP = new Set([
  "the", "a", "an", "and", "of", "at", "by", "in", "on", "&", "ltd", "limited", "inc", "llc", "co", "company",
  "hotel", "resort", "resorts", "and", "spa", "villa", "villas", "suites", "apartments", "tours", "tour",
  "restaurant", "bar", "grill", "beach", "club", "services", "service", "the", "s",
]);

/** Distinctive lower-case words of a business name, without its destination. */
function placeWordSet(place) {
  const words = new Set(String(place).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (words.has("st") || words.has("saint")) { words.add("st"); words.add("saint"); }
  return words;
}

export function nameTokens(title, place = "") {
  const placeWords = placeWordSet(place);
  return new Set(
    String(title)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
      .filter((word) => word.length > 1 && !STOP.has(word) && !placeWords.has(word)),
  );
}

function plainName(title) {
  return String(title).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w && !["ltd", "limited", "inc", "llc", "the", "co"].includes(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)).join(" ");
}

/**
 * Same business name? Distinctive words must mostly match AND the first
 * distinctive word must be shared (so "Capella Marigot Bay" is not "Zoetry
 * Marigot Bay"); names made only of generic words compare in full.
 */
export function sameBusinessName(a, b, place = "") {
  // "Eco Dive, Grenada Blue" / "EcoDive Grenada", "SunTours" / "Sun Tours": spacing differs.
  const placeWords = placeWordSet(place);
  const compact = (title) => plainName(title).split(" ").filter((w) => !placeWords.has(w)).join("");
  const [ca, cb] = [compact(a), compact(b)];
  if (ca.length >= 6 && cb.length >= 6 && (ca.startsWith(cb) || cb.startsWith(ca))) return true;
  const left = [...nameTokens(a, place)];
  const right = [...nameTokens(b, place)];
  if (!left.length || !right.length) return plainName(a) === plainName(b) && plainName(a).length > 0;
  const overlap = nameOverlap(a, b, place);
  if (overlap >= 0.6 && (left[0] === right[0] || overlap === 1)) return true;
  // A distinctive leading name ("Shadowfax", "Spinnakers") shared by both.
  return overlap >= 0.5 && left[0] === right[0] && left[0].length >= 5;
}

/** Share of the smaller name's distinctive words found in the other name (0..1). */
export function nameOverlap(a, b, place = "") {
  const left = nameTokens(a, place);
  const right = nameTokens(b, place);
  if (!left.size || !right.size) return 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const word of small) if (large.has(word)) shared++;
  return shared / small.size;
}
