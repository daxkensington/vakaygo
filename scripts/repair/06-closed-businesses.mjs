/**
 * Closed businesses (audit ops-data#5).
 *
 * Only what is already stored can be used offline: Google's businessStatus is on
 * 788 of ~8,000 active listings. CLOSED_PERMANENTLY and CLOSED_TEMPORARILY
 * listings are paused with the reason recorded (a temporarily closed business is
 * reactivated by clearing the pause once it reopens). The enrich-listings cron
 * now asks Google for business_status on every listing it refreshes, so the rest
 * are classified as the cron works through the queue.
 * Claimed listings are never changed.
 */
import { APPLY, database, outputFile, summary, CLAIMED_SQL } from "./_lib.mjs";

const SCRIPT = "06-closed-businesses";
const db = database();
const rows = await db.query(`
  SELECT l.id, l.slug, l.title, i.slug AS island, l.type_data->>'businessStatus' AS business_status
    FROM listings l JOIN islands i ON i.id=l.island_id
   WHERE l.status='active' AND l.type_data->>'businessStatus' IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY') AND NOT ${CLAIMED_SQL}`);
const known = await db.query(`SELECT count(*) FILTER (WHERE type_data->>'businessStatus' IS NOT NULL)::int known, count(*)::int total FROM listings WHERE status='active'`);
summary(SCRIPT, {
  "listings with a stored Google status": `${known[0].known} of ${known[0].total}`,
  "closed permanently": rows.filter((r) => r.business_status === "CLOSED_PERMANENTLY").length,
  "closed temporarily": rows.filter((r) => r.business_status === "CLOSED_TEMPORARILY").length,
});
console.log("  plan:", outputFile(SCRIPT, "plan", rows.map((r) => ({ id: r.id, url: `${r.island}/${r.slug}`, title: r.title, status: r.business_status }))));

if (APPLY && rows.length) {
  console.log("  backup:", outputFile(SCRIPT, "backup", await db.query(`SELECT * FROM listings WHERE id = ANY($1::uuid[])`, [rows.map((r) => r.id)])));
  await db.transaction(rows.map((r) => [
    `UPDATE listings SET status='paused', updated_at=now(),
       type_data=(type_data::jsonb || jsonb_build_object('pausedReason', lower($2::text), 'pausedAt', now()))::json
     WHERE id=$1::uuid AND status='active'`, [r.id, r.business_status]]));
  console.log(`  paused ${rows.length}`);
}
