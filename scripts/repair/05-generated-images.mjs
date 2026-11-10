/**
 * AI-generated stock images shown as the business (audit ops-data#13).
 *
 * scripts/fix-dead-images.ts once filled gaps with generated pictures under
 * /images/generated/. They are not photos of the business, yet some are the
 * listing's primary image and all reach Google structured data. This deletes
 * those media rows. Where a deleted row was the primary image and the listing
 * has a real photo, the first real photo (lowest sort order) becomes primary;
 * a listing with no real photo keeps no picture and shows the placeholder.
 * Claimed listings are left for their owners.
 */
import { APPLY, database, outputFile, summary, CLAIMED_SQL } from "./_lib.mjs";

const SCRIPT = "05-generated-images";
const db = database();
const rows = await db.query(`
  SELECT m.*, l.slug, i.slug AS island,
         (SELECT count(*)::int FROM media o WHERE o.listing_id=m.listing_id AND o.url NOT LIKE '%/images/generated/%') AS real_photos
    FROM media m JOIN listings l ON l.id=m.listing_id JOIN islands i ON i.id=l.island_id
   WHERE m.url LIKE '%/images/generated/%' AND NOT ${CLAIMED_SQL}
   ORDER BY l.slug, m.sort_order`);
const listings = new Map();
for (const r of rows) {
  const entry = listings.get(r.listing_id) ?? { listingId: r.listing_id, url: `${r.island}/${r.slug}`, generated: 0, primaryGenerated: false, realPhotos: r.real_photos };
  entry.generated++;
  if (r.is_primary) entry.primaryGenerated = true;
  listings.set(r.listing_id, entry);
}
const all = [...listings.values()];
summary(SCRIPT, {
  "generated media rows to delete": rows.length,
  "listings affected": all.length,
  "primary image replaced by a real photo": all.filter((l) => l.primaryGenerated && l.realPhotos > 0).length,
  "listings left with no photo": all.filter((l) => l.realPhotos === 0).length,
});
console.log("  plan:", outputFile(SCRIPT, "plan", all));

if (APPLY && rows.length) {
  console.log("  backup:", outputFile(SCRIPT, "backup", rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !['slug', 'island', 'real_photos'].includes(key))))));
  const ids = rows.map((r) => r.id);
  const promote = all.filter((l) => l.primaryGenerated && l.realPhotos > 0).map((l) => l.listingId);
  await db.transaction([
    [`DELETE FROM media WHERE id = ANY($1::uuid[]) AND url LIKE '%/images/generated/%'`, [ids]],
    [`UPDATE media m SET is_primary=true FROM (
        SELECT DISTINCT ON (listing_id) id FROM media WHERE listing_id = ANY($1::uuid[]) ORDER BY listing_id, sort_order NULLS LAST, created_at
      ) first WHERE m.id=first.id
        AND NOT EXISTS(SELECT 1 FROM media p WHERE p.listing_id=m.listing_id AND p.is_primary)`, [promote]],
  ]);
  console.log(`  deleted ${rows.length}, promoted a real photo on ${promote.length}`);
}
