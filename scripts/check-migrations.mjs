/**
 * Ask a database whether it has run every migration in this checkout.
 *
 *   DATABASE_URL=... npm run db:check
 *
 * Exits 1 when the database is behind, so it can gate a release step. Run it against
 * production BEFORE deploying code that needs a new migration — a git-integration
 * deploy applies nothing on its own, and code over a stale schema fails at runtime
 * on the pages that use it while the homepage keeps answering 200.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { compareMigrations, describeDrift } from "../lib/migration-state.ts";

const FOLDER = path.join(import.meta.dirname, "..", "drizzle", "migrations");

function readJournal() {
  const journalPath = path.join(FOLDER, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    throw new Error(`No migration journal at ${journalPath}`);
  }
  return JSON.parse(fs.readFileSync(journalPath, "utf8")).entries;
}

/** Same hash drizzle records: sha256 over the raw file text. */
function hashOf(tag) {
  const file = path.join(FOLDER, `${tag}.sql`);
  if (!fs.existsSync(file)) throw new Error(`Journal names ${tag} but ${file} is missing`);
  return crypto.createHash("sha256").update(fs.readFileSync(file).toString()).digest("hex");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot tell whether the schema is current.");
  process.exit(1);
}

const entries = readJournal();
const sql = neon(url);

let applied;
try {
  applied = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC`;
} catch (error) {
  // A missing bookkeeping table is not "nothing to do" — it means this database was
  // never managed by drizzle, and we must not report it as healthy.
  console.error("Could not read drizzle.__drizzle_migrations:", error?.message || error);
  console.error("If this database was provisioned by applying the .sql files directly, this check does not apply to it.");
  process.exit(1);
}

const report = compareMigrations(entries, applied);
console.log(describeDrift(report));

// A migration edited after it was applied diverges silently: the database ran one
// thing, the repo now says another, and nothing re-runs it. Report it, but never
// fail on the 2026-04-15 baseline, whose hash was inserted by hand (drizzle/MIGRATIONS.md).
const recorded = new Set(applied.map((row) => row.hash));
const edited = entries
  .filter((entry) => entry.idx !== 0)
  .filter((entry) => !report.pending.includes(entry))
  .filter((entry) => !recorded.has(hashOf(entry.tag)));

if (edited.length > 0) {
  console.warn(
    `\nWarning: applied but changed on disk since: ${edited.map((e) => e.tag).join(", ")}.\n` +
    `The database ran an earlier version of these files and will not re-run them.`
  );
}

process.exit(report.pending.length > 0 ? 1 : 0);
