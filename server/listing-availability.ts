import { neon } from "@neondatabase/serverless";

/**
 * Open the next 90 days for a listing that has no future availability yet.
 *
 * This is the same default the admin listing approval applies. A newly claimed
 * business is then bookable the moment it finishes onboarding and blocks the
 * dates it cannot take in the calendar, instead of opening dates one by one on
 * a page nothing linked to. Idempotent: a listing with any future availability
 * row is left exactly as it is. Returns the number of days opened.
 */
export const DEFAULT_OPEN_DAYS = 90;

export async function ensureDefaultAvailability(listingId: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(
    `WITH target AS (
       SELECT l.id,
              GREATEST(1, coalesce(l.max_guests, CASE WHEN l.type IN ('stay','transport','transfer') THEN 1 ELSE 10 END)) AS spots
         FROM listings l
        WHERE l.id=$1::uuid
          AND NOT EXISTS (SELECT 1 FROM availability a WHERE a.listing_id=l.id AND a.date>=current_date)
     )
     INSERT INTO availability(listing_id,date,spots,spots_remaining,is_blocked)
     SELECT t.id,(current_date + offs * interval '1 day')::timestamp,t.spots,t.spots,false
       FROM target t, generate_series(0,$2::int - 1) AS offs
     RETURNING date`,
    [listingId, DEFAULT_OPEN_DAYS]
  ) as { date: string }[];
  return rows.length;
}

export async function extendClaimedAvailability(): Promise<{ candidates: number; opened: number }> {
  if (!process.env.DATABASE_URL) return { candidates: 0, opened: 0 };
  const sql = neon(process.env.DATABASE_URL);
  const results = await sql.transaction(tx => [
    tx.query("SELECT pg_advisory_xact_lock(hashtextextended('vakaygo-rolling-availability',0))"),
    tx.query(`WITH target AS (
       SELECT l.id,
              GREATEST(1, coalesce(l.max_guests, CASE WHEN l.type IN ('stay','transport','transfer') THEN 1 ELSE 10 END)) AS spots,
              GREATEST(current_date, coalesce(max(a.date)::date + 1, current_date)) AS start_date
         FROM listing_onboarding n
         JOIN listings l ON l.id=n.listing_id
         LEFT JOIN availability a ON a.listing_id=l.id
        GROUP BY l.id
     ), inserted AS (
       INSERT INTO availability(listing_id,date,spots,spots_remaining,is_blocked)
       SELECT t.id,d.date,t.spots,t.spots,false
         FROM target t
         CROSS JOIN LATERAL generate_series(t.start_date::timestamp,(current_date + ($1::int - 1))::timestamp,interval '1 day') AS d(date)
        WHERE NOT EXISTS (SELECT 1 FROM availability a WHERE a.listing_id=t.id AND a.date::date=d.date::date)
       RETURNING listing_id
     )
     SELECT (SELECT count(*) FROM target)::int AS candidates,(SELECT count(*) FROM inserted)::int AS opened`, [DEFAULT_OPEN_DAYS]),
  ], { isolationLevel: "ReadCommitted" });
  const result = results[1][0] as { candidates: number; opened: number } | undefined;
  return result || { candidates: 0, opened: 0 };
}
