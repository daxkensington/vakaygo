/**
 * Is the database this build talks to caught up with the migrations in this build?
 *
 * On 2026-09-06 a deploy shipped code that called `vakaygo_listing_claim_verified()`
 * while production still sat at migration 0003. Nothing applies migrations for you on
 * a git-integration deploy, so the code went live over a schema that did not have it
 * and every listing detail page 500'd for six days. The homepage kept returning 200,
 * so nothing looked wrong. This module is the check that would have caught it.
 *
 * "Pending" is defined exactly the way drizzle-orm's own migrator defines it
 * (see node_modules/drizzle-orm/neon-http/migrator.js): it takes the newest
 * `created_at` in drizzle.__drizzle_migrations and applies every journal entry
 * stamped later than that. Hashes are recorded but never compared, so we don't
 * compare them either — mirroring the tool means this check and `db:migrate`
 * can never disagree about what is outstanding.
 */

export type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

export type AppliedRow = {
  /** Postgres bigint arrives as a string over the wire; milliseconds since epoch. */
  created_at: string | number;
  hash?: string;
};

export type DriftReport = {
  /** Migrations on disk that the database has not run yet, in journal order. */
  pending: JournalEntry[];
  /** Highest migration timestamp the database has recorded, or null when it has none. */
  lastAppliedMillis: number | null;
  /** Total journal entries shipped in this build. */
  expected: number;
};

/**
 * Compare the journal shipped in this build against the rows the database holds.
 *
 * An empty `applied` means the table exists but is untouched — every migration is
 * outstanding, which is what drizzle itself would conclude. Callers that provision a
 * database by other means (CI applies the .sql files directly with psql and never
 * writes the bookkeeping table) must not run this check against it; it describes
 * drizzle-managed databases only.
 */
export function compareMigrations(
  journal: JournalEntry[],
  applied: AppliedRow[]
): DriftReport {
  const entries = [...journal].sort((a, b) => a.when - b.when);

  let lastAppliedMillis: number | null = null;
  for (const row of applied) {
    const millis = Number(row.created_at);
    if (!Number.isFinite(millis)) continue;
    if (lastAppliedMillis === null || millis > lastAppliedMillis) {
      lastAppliedMillis = millis;
    }
  }

  const pending =
    lastAppliedMillis === null
      ? entries
      : entries.filter((entry) => entry.when > lastAppliedMillis!);

  return { pending, lastAppliedMillis, expected: entries.length };
}

/**
 * One line a human can act on. Never returns an empty string — a check whose
 * healthy output is blank is a check nobody notices has stopped running.
 */
export function describeDrift(report: DriftReport): string {
  if (report.pending.length === 0) {
    return `Database is current: all ${report.expected} migrations applied.`;
  }
  const tags = report.pending.map((entry) => entry.tag).join(", ");
  return (
    `Database is behind this build by ${report.pending.length} migration` +
    `${report.pending.length === 1 ? "" : "s"}: ${tags}. ` +
    `Code that depends on them will fail at runtime. Apply with: npm run db:migrate`
  );
}
