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
