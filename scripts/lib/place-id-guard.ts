import { sql } from "drizzle-orm";

type Db = { execute: (query: ReturnType<typeof sql>) => PromiseLike<unknown> };

/**
 * True when an active listing on this destination already carries the Google
 * place ID. Importing it again creates a duplicate page, or gives a different
 * business another place's rating, phone and claim number (see
 * scripts/repair/01-shared-place-ids.mjs and lib/listing-import-guards.ts).
 */
export async function placeIdTaken(db: Db, placeId: string | null | undefined, islandId: number): Promise<boolean> {
  if (!placeId) return false;
  const result = await db.execute(sql`
    SELECT 1 FROM listings
     WHERE island_id = ${islandId} AND status <> 'rejected'
       AND coalesce(type_data->>'googlePlaceId', type_data->>'placeId') = ${placeId}
     LIMIT 1`);
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows;
  return Array.isArray(rows) && rows.length > 0;
}
