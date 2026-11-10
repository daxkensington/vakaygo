import { neon } from "@neondatabase/serverless";

/**
 * Retention for data that identifies a visitor but is only needed briefly.
 *
 * Listing views store the visitor's address so one person is counted once an
 * hour and crawler networks can be recognised. After 30 days neither use
 * needs the full address, so it is shortened to its network: the last octet
 * of an IPv4 address becomes 0, an IPv6 address keeps its first three groups.
 * Rows are kept (view counts do not change); only the address is coarsened.
 * A shortened address still matches the network patterns used to flag crawler
 * ranges (for example `116.179.33.%`).
 *
 * Usage-budget counters (server/usage-budget.ts) are only read for the
 * current day; rows older than 35 days are deleted. That table arrives with
 * migration 0021, so its absence is not an error.
 */

export const VIEW_IP_RETENTION_DAYS = 30;
export const USAGE_COUNTER_RETENTION_DAYS = 35;
/** Rows per run; the daily cron works through any backlog over a few days. */
export const RETENTION_BATCH = 5000;

/** Addresses still stored in full: dotted IPv4 not ending in .0, or IPv6 not ending in "::". */
const FULL_ADDRESS = `(viewer_ip ~ '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$' AND viewer_ip !~ '\\.0$')
  OR (viewer_ip LIKE '%:%' AND viewer_ip !~ '::$')`;

const COARSEN = `CASE
  WHEN viewer_ip ~ '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$' THEN regexp_replace(viewer_ip,'\\.[0-9]{1,3}$','.0')
  ELSE regexp_replace(viewer_ip,'^((?:[0-9a-fA-F]{0,4}:){1,3}).*$','\\1:') END`;

export const COUNT_OLD_VIEW_ADDRESSES_SQL = `SELECT count(*)::int AS due FROM listing_views
  WHERE created_at < now() - ($1::int * interval '1 day') AND (${FULL_ADDRESS})`;

export const COARSEN_VIEW_ADDRESSES_SQL = `WITH due AS (
    SELECT id FROM listing_views
    WHERE created_at < now() - ($1::int * interval '1 day') AND (${FULL_ADDRESS})
    ORDER BY id LIMIT $2::int
  ), changed AS (
    UPDATE listing_views v SET viewer_ip = ${COARSEN.replace(/viewer_ip/g, "v.viewer_ip")} FROM due WHERE v.id = due.id RETURNING v.id
  ) SELECT count(*)::int AS changed FROM changed`;

export const COUNT_OLD_USAGE_COUNTERS_SQL = `SELECT count(*)::int AS due FROM usage_budget_counters
  WHERE day < (now() AT TIME ZONE 'utc')::date - $1::int`;

export const DELETE_OLD_USAGE_COUNTERS_SQL = `WITH gone AS (
    DELETE FROM usage_budget_counters WHERE day < (now() AT TIME ZONE 'utc')::date - $1::int RETURNING 1
  ) SELECT count(*)::int AS deleted FROM gone`;

/** The JavaScript twin of the SQL above, for tests and for anything that must coarsen before storing. */
export function coarsenAddress(address: string): string {
  const ipv4 = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(address);
  if (ipv4) return `${ipv4[1]}.0`;
  if (address.includes(":")) {
    const groups = /^((?:[0-9a-fA-F]{0,4}:){1,3})/.exec(address);
    return groups ? `${groups[1]}:` : address;
  }
  return address;
}

type Query = (text: string, params: unknown[]) => Promise<unknown>;
const firstRow = (result: unknown): Record<string, unknown> => {
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows;
  return (Array.isArray(rows) ? rows[0] : undefined) as Record<string, unknown> ?? {};
};
const missingTable = (error: unknown) => {
  const failure = error as { code?: string; cause?: { code?: string }; message?: string };
  return (failure?.code ?? failure?.cause?.code) === "42P01" || /does not exist/i.test(String(failure?.message || ""));
};

export interface RetentionResult {
  dryRun: boolean;
  viewAddresses: { due: number; coarsened: number };
  usageCounters: { due: number; deleted: number; tableMissing: boolean };
}

export async function runPrivacyRetention(options: { dryRun?: boolean; query?: Query } = {}): Promise<RetentionResult> {
  const dryRun = options.dryRun === true;
  const query: Query = options.query ?? ((text, params) => neon(process.env.DATABASE_URL!).query(text, params));
  const result: RetentionResult = { dryRun, viewAddresses: { due: 0, coarsened: 0 }, usageCounters: { due: 0, deleted: 0, tableMissing: false } };

  result.viewAddresses.due = Number(firstRow(await query(COUNT_OLD_VIEW_ADDRESSES_SQL, [VIEW_IP_RETENTION_DAYS])).due) || 0;
  if (!dryRun && result.viewAddresses.due > 0) {
    result.viewAddresses.coarsened = Number(firstRow(await query(COARSEN_VIEW_ADDRESSES_SQL, [VIEW_IP_RETENTION_DAYS, RETENTION_BATCH])).changed) || 0;
  }

  try {
    result.usageCounters.due = Number(firstRow(await query(COUNT_OLD_USAGE_COUNTERS_SQL, [USAGE_COUNTER_RETENTION_DAYS])).due) || 0;
    if (!dryRun && result.usageCounters.due > 0) {
      result.usageCounters.deleted = Number(firstRow(await query(DELETE_OLD_USAGE_COUNTERS_SQL, [USAGE_COUNTER_RETENTION_DAYS])).deleted) || 0;
    }
  } catch (error) {
    if (!missingTable(error)) throw error;
    result.usageCounters.tableMissing = true;
  }
  return result;
}
