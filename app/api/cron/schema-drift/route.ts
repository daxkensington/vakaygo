import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import journal from "@/drizzle/migrations/meta/_journal.json";
import { compareMigrations, describeDrift, type AppliedRow } from "@/lib/migration-state";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Does the database this deployment talks to have the migrations this deployment
 * was built with?
 *
 * Deploys apply nothing on their own. On 2026-09-06 code shipped over a schema six
 * migrations behind it; every listing detail page and all of email sign-in 500'd for
 * six days while the homepage kept returning 200, so no smoke test and no person
 * noticed. This runs on a schedule for exactly that gap: it compares the journal
 * baked into the running build against drizzle's bookkeeping table in the live
 * database, and fails loudly the moment the two disagree.
 *
 * Non-200 on drift is deliberate — it surfaces on Vercel's cron dashboard, and the
 * logger.error reaches Sentry, so the signal does not depend on anyone reading JSON.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    logger.error("Schema drift check cannot run: DATABASE_URL is not set");
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }

  const sql = neon(process.env.DATABASE_URL);

  let applied: AppliedRow[];
  try {
    applied = (await sql`
      SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC
    `) as AppliedRow[];
  } catch (error) {
    // Unreadable bookkeeping is not "no pending migrations". Never report healthy
    // on the strength of a failed query.
    logger.error("Schema drift check could not read drizzle.__drizzle_migrations", { error });
    return NextResponse.json({ error: "Migration state is unreadable" }, { status: 503 });
  }

  const report = compareMigrations(journal.entries, applied);
  const summary = describeDrift(report);

  if (report.pending.length > 0) {
    logger.error("Database schema is behind the deployed code", {
      summary,
      pending: report.pending.map((entry) => entry.tag),
      lastAppliedMillis: report.lastAppliedMillis,
    });
    return NextResponse.json(
      {
        drift: true,
        summary,
        pending: report.pending.map((entry) => entry.tag),
        expected: report.expected,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ drift: false, summary, expected: report.expected });
}
