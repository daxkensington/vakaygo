/**
 * Guard: one active listing per Google place ID, destination and type.
 * Run AFTER 01-shared-place-ids.mjs --apply. The dry run lists any place IDs
 * still shared; --apply creates the unique index only when there are none, so
 * a future import or enrichment that reuses a place ID fails loudly instead of
 * creating another duplicate page.
 */
import { APPLY, database, outputFile, summary } from "./_lib.mjs";

const SCRIPT = "07-place-id-unique-index";
const KEY = `coalesce(type_data->>'googlePlaceId', type_data->>'placeId')`;
const db = database();
const shared = await db.query(`SELECT island_id, type::text AS type, ${KEY} AS pid, count(*)::int n, array_agg(slug) slugs
    FROM listings WHERE status='active' AND ${KEY} IS NOT NULL GROUP BY 1,2,3 HAVING count(*) > 1`);
const exists = (await db.query(`SELECT to_regclass('public.listings_active_place_unique') IS NOT NULL AS ok`))[0].ok;
summary(SCRIPT, { "place IDs still shared (same destination and type)": shared.length, "index already present": exists });
console.log("  plan:", outputFile(SCRIPT, "plan", shared));
if (APPLY) {
  if (exists) { console.log("  nothing to do"); process.exit(0); }
  if (shared.length) { console.error("  refusing: run 01-shared-place-ids.mjs --apply first"); process.exit(1); }
  await db.sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS listings_active_place_unique
    ON listings (island_id, type, (${KEY})) WHERE status='active' AND ${KEY} IS NOT NULL`);
  console.log("  created listings_active_place_unique");
}
