import { sql, type SQL } from "drizzle-orm";
import { listingViews } from "@/drizzle/schema";

/**
 * Listing-view attribution columns arrive with migration 0019
 * (ua_family, referrer_host, utm_source, country, is_bot, bot_reason).
 * A git deploy applies no migration, so this code must also run against a
 * database that does not have them yet: it asks once per server instance
 * and writes/filters the old way until they exist.
 */

type Executor = { execute: (query: SQL) => PromiseLike<unknown> };

let ready: boolean | null = null;
let checkedAt = 0;
const RECHECK_MS = 60_000;

function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? rows : [];
}

/** True once `listing_views.is_bot` exists. A positive answer is kept; a negative one is re-asked after a minute. */
export async function viewAttributionReady(db: Executor, now: number = Date.now()): Promise<boolean> {
  if (ready === true) return true;
  if (ready === false && now - checkedAt < RECHECK_MS) return false;
  try {
    const result = await db.execute(sql`SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'listing_views' AND column_name = 'is_bot' LIMIT 1`);
    ready = rowsOf(result).length > 0;
  } catch {
    ready = false;
  }
  checkedAt = now;
  return ready;
}

/** For tests, and for the write path when the database says a column is gone. */
export function forgetViewAttributionState() {
  ready = null;
  checkedAt = 0;
}

/**
 * Restricts a `listing_views` query to people. Trending, operator
 * analytics and AI insights count these; raw rows stay for audit.
 */
export function humanViews(attributionReady: boolean): SQL {
  return attributionReady ? sql`${listingViews.isBot} = false` : sql`true`;
}

export type ViewRecord = {
  listingId: string;
  viewerIp: string;
  userId: string | null;
  source: string;
  uaFamily: string;
  referrerHost: string | null;
  utmSource: string | null;
  country: string | null;
  botReason: string | null;
};

/** Inserts one view, with attribution when the columns exist. */
export async function recordListingView(db: Executor, view: ViewRecord): Promise<void> {
  if (await viewAttributionReady(db)) {
    try {
      await db.execute(sql`INSERT INTO listing_views
        (listing_id, viewer_ip, user_id, source, ua_family, referrer_host, utm_source, country, is_bot, bot_reason)
        VALUES (${view.listingId}, ${view.viewerIp}, ${view.userId}, ${view.source}, ${view.uaFamily},
          ${view.referrerHost}, ${view.utmSource}, ${view.country}, ${view.botReason !== null}, ${view.botReason})`);
      return;
    } catch (error) {
      // undefined_column: the columns were removed under a warm instance. Count the view the old way.
      const failure = error as { code?: string; cause?: { code?: string } };
      if ((failure?.code ?? failure?.cause?.code) !== "42703") throw error;
      forgetViewAttributionState();
    }
  }
  await db.execute(sql`INSERT INTO listing_views (listing_id, viewer_ip, user_id, source)
    VALUES (${view.listingId}, ${view.viewerIp}, ${view.userId}, ${view.source})`);
}
