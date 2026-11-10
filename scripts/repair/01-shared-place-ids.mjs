/**
 * Shared Google place IDs (audit ops-data#3, traveler-ux#4, seo-tech#3, seo-demand#16).
 *
 * 143 place IDs sit on 311 active listings, so unrelated businesses inherit one
 * place's rating, phone, website, opening hours and claim-verification phone.
 * Per place ID this keeps the ID on one listing (the keeper) and, on every other
 * listing in the group:
 *  - a DUPLICATE (same type, same distinctive name words as the keeper) is paused
 *    and its URL is recorded in listing_slug_redirects so it 301s to the keeper;
 *  - the SAME business listed for another service (same name, other type) is left alone;
 *  - a DIFFERENT business loses the borrowed place data: place ID, Maps link,
 *    Google rating and count, Google types, business status and hours, plus the
 *    phone, website and trusted claim phone when they equal the keeper's. Its
 *    photos are flagged for review (photosNeedReview) because they may show the
 *    other place.
 * Keeper: a claimed listing; else the single Google-imported record (its title is
 * the place's own name); else the record with the most Google reviews.
 * Claimed listings are never changed. A group with two claimed listings is skipped.
 *
 * Needs migration 0024 (listing_slug_redirects) applied before --apply.
 */
import { APPLY, database, outputFile, summary, nameOverlap, sameBusinessName, CLAIMED_SQL } from "./_lib.mjs";

const SCRIPT = "01-shared-place-ids";
const PLACE_KEYS = ["googlePlaceId", "placeId", "googleMapsUrl", "googleRating", "googleReviewCount", "googleTypes", "businessStatus", "hours"];

const db = database();
const rows = await db.query(`
  WITH g AS (
    SELECT coalesce(l.type_data->>'googlePlaceId', l.type_data->>'placeId') pid
      FROM listings l WHERE l.status='active' AND coalesce(l.type_data->>'googlePlaceId', l.type_data->>'placeId') IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1)
  SELECT l.id, l.slug, l.title, l.type::text AS type, l.island_id, i.slug AS island, i.name AS island_name,
         g.pid, l.type_data->>'source' AS source, coalesce(l.review_count,0) AS review_count, l.created_at,
         l.type_data->>'phone' AS phone, l.type_data->>'website' AS website,
         ${CLAIMED_SQL} AS claimed,
         (SELECT count(*)::int FROM reviews r WHERE r.listing_id=l.id) AS own_reviews,
         (SELECT array_agg(t.phone) FROM listing_trusted_contacts t WHERE t.listing_id=l.id) AS trusted_phones
    FROM listings l JOIN g ON g.pid=coalesce(l.type_data->>'googlePlaceId', l.type_data->>'placeId')
    JOIN islands i ON i.id=l.island_id
   WHERE l.status='active'
   ORDER BY g.pid, l.created_at`);

const groups = new Map();
for (const row of rows) {
  if (!groups.has(row.pid)) groups.set(row.pid, []);
  groups.get(row.pid).push(row);
}

function chooseKeeper(group) {
  const claimed = group.filter((r) => r.claimed);
  if (claimed.length > 1) return null;
  if (claimed.length === 1) return claimed[0];
  const google = group.filter((r) => r.source === "google-places");
  const pool = google.length ? google : group;
  return [...pool].sort((a, b) => b.review_count - a.review_count || new Date(a.created_at) - new Date(b.created_at))[0];
}

const plan = { duplicates: [], sameBusinessOtherService: [], cleared: [], skippedGroups: [], keepers: [] };
for (const [pid, group] of groups) {
  const keeper = chooseKeeper(group);
  if (!keeper) { plan.skippedGroups.push({ pid, reason: "two claimed listings", slugs: group.map((r) => r.slug) }); continue; }
  plan.keepers.push({ pid, keeper: `${keeper.island}/${keeper.slug}`, size: group.length });
  for (const row of group) {
    if (row.id === keeper.id || row.claimed) continue;
    const overlap = nameOverlap(row.title, keeper.title, row.island_name);
    const base = { id: row.id, url: `${row.island}/${row.slug}`, title: row.title, keeper: `${keeper.island}/${keeper.slug}`, keeperTitle: keeper.title, keeperId: keeper.id, overlap: Number(overlap.toFixed(2)) };
    const same = sameBusinessName(row.title, keeper.title, row.island_name);
    if (same && row.type === keeper.type && row.island_id === keeper.island_id) {
      plan.duplicates.push({ ...base, islandId: row.island_id, slug: row.slug });
    } else if (same) {
      // The same business offering another service (e.g. its transfer and its tours): its data is its own.
      plan.sameBusinessOtherService.push(base);
    } else {
      const keeperPhones = new Set([keeper.phone, ...(keeper.trusted_phones || [])].filter(Boolean));
      plan.cleared.push({
        ...base,
        clearPhone: !!row.phone && row.phone === keeper.phone,
        clearWebsite: !!row.website && row.website === keeper.website,
        dropTrustedPhones: (row.trusted_phones || []).filter((p) => keeperPhones.has(p)),
        resetRating: row.own_reviews === 0,
      });
    }
  }
}

const ids = [...plan.duplicates, ...plan.cleared].map((r) => r.id);
summary(SCRIPT, {
  "shared place IDs": groups.size,
  "listings in those groups": rows.length,
  "duplicates to pause + redirect": plan.duplicates.length,
  "same business, other service (unchanged)": plan.sameBusinessOtherService.length,
  "different businesses to clear": plan.cleared.length,
  "of which phone cleared": plan.cleared.filter((r) => r.clearPhone).length,
  "of which website cleared": plan.cleared.filter((r) => r.clearWebsite).length,
  "trusted claim phones removed": plan.cleared.reduce((n, r) => n + r.dropTrustedPhones.length, 0),
  "groups skipped": plan.skippedGroups.length,
});
console.log("  plan:", outputFile(SCRIPT, "plan", plan));

if (APPLY) {
  const exists = await db.query(`SELECT to_regclass('public.listing_slug_redirects') IS NOT NULL AS ok`);
  if (!exists[0].ok) { console.error("listing_slug_redirects is missing: apply migration 0024 first."); process.exit(1); }
  const backup = {
    listings: await db.query(`SELECT * FROM listings WHERE id = ANY($1::uuid[])`, [ids]),
    trustedContacts: await db.query(`SELECT * FROM listing_trusted_contacts WHERE listing_id = ANY($1::uuid[])`, [ids]),
  };
  console.log("  backup:", outputFile(SCRIPT, "backup", backup));
  const statements = [];
  for (const d of plan.duplicates) {
    statements.push([`UPDATE listings SET status='paused', updated_at=now(),
        type_data=(type_data::jsonb || jsonb_build_object('pausedReason','duplicate','duplicateOf',$2::text,'pausedAt',now()))::json
      WHERE id=$1::uuid AND status='active'`, [d.id, d.keeperId]]);
    statements.push([`INSERT INTO listing_slug_redirects(island_id, slug, target_listing_id, reason)
      VALUES($1,$2,$3::uuid,'duplicate') ON CONFLICT (island_id, slug) DO UPDATE SET target_listing_id=EXCLUDED.target_listing_id, reason=EXCLUDED.reason`,
      [d.islandId, d.slug, d.keeperId]]);
  }
  for (const c of plan.cleared) {
    const keys = [...PLACE_KEYS, ...(c.clearPhone ? ["phone"] : []), ...(c.clearWebsite ? ["website"] : [])];
    statements.push([`UPDATE listings SET updated_at=now(),
        ${c.resetRating ? "avg_rating=NULL, review_count=0," : ""}
        type_data=((type_data::jsonb - $2::text[]) || jsonb_build_object('placeDataClearedAt', now(), 'photosNeedReview', true, 'sharedPlaceWith', $3::text))::json
      WHERE id=$1::uuid`, [c.id, keys, c.keeperId]]);
    if (c.dropTrustedPhones.length) {
      statements.push([`DELETE FROM listing_trusted_contacts WHERE listing_id=$1::uuid AND phone = ANY($2::text[])`, [c.id, c.dropTrustedPhones]]);
    }
  }
  await db.transaction(statements);
  console.log(`  applied ${statements.length} statements`);
}
