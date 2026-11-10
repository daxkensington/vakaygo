/**
 * Listings under the wrong destination or type (audit ops-data#8).
 *
 * - British Virgin Islands listings with a St John / St Thomas address move to
 *   us-virgin-islands (their old URL is recorded in listing_slug_redirects, so it
 *   301s to the new one; needs migration 0024).
 * - Listings whose address or point is far from their destination are paused:
 *   mainland Belize (Placencia, Hopkins) and Mexico under Ambergris Caye (Belize
 *   City transfers and water taxis serve the island and stay),
 *   St Barthelemy under St Kitts, Athens/Vari under Crete, Dubrovnik/Cavtat under
 *   Hvar & Split. VakayGo has no destination for them.
 * - Security and guarding firms filed as VIP experiences are paused (chauffeur,
 *   transfer and close-protection services for visitors stay).
 * - Two obvious type mix-ups are retyped (an adventure park and a spa filed as dining).
 * Claimed listings are never changed. The plan lists every match by name for review.
 */
import { APPLY, database, outputFile, summary, CLAIMED_SQL } from "./_lib.mjs";

const SCRIPT = "04-misfiled-listings";
const db = database();
const base = `FROM listings l JOIN islands i ON i.id=l.island_id WHERE l.status='active' AND NOT ${CLAIMED_SQL}`;
const pick = `l.id, l.slug, l.title, l.type::text AS type, l.island_id, i.slug island, left(coalesce(l.address,''),90) address, l.latitude::float lat, l.longitude::float lng`;

const moveToUsvi = await db.query(`SELECT ${pick} ${base} AND i.slug='british-virgin-islands'
  AND (l.address ~* '(st\\.? john|saint john|cruz bay|coral bay|st\\.? thomas|charlotte amalie|red hook|\\m008\\d\\d)' )`);
const elsewhere = await db.query(`SELECT ${pick},
   CASE
     WHEN i.slug='ambergris-caye' AND (l.address ~* '(placencia|hopkins|seine bight|dangriga|playa del carmen|quintana roo|m[eé]xico)' OR l.latitude::float < 17.0 OR l.latitude::float > 18.6) THEN 'not on Ambergris Caye'
     WHEN i.slug='st-kitts' AND l.address ~* '(st\\.? barth|saint[- ]barth|gustavia|lurin|saint-barth[eé]lemy|97133)' THEN 'St Barthelemy'
     WHEN i.slug='crete' AND l.address ~* '(ath[eií]na|athens|vari|attica|αθήνα|βάρη)' THEN 'Athens area'
     WHEN i.slug='hvar-split' AND l.address ~* '(dubrovnik|cavtat|konavle)' THEN 'Dubrovnik area'
   END AS reason
   ${base} AND i.slug IN ('ambergris-caye','st-kitts','crete','hvar-split')`).then((rows) => rows.filter((r) => r.reason));
const security = await db.query(`SELECT ${pick} ${base} AND l.type='vip'
  AND l.title ~* '(securit|s[ée]curit[ée]|gardi[ée]nnage|t[ée]l[ée]surveillance|\\mprotection\\M|\\mguard(ing|s)?\\M|\\mLKS\\M|\\mAPSIL\\M)'
  AND l.title !~* '(transfer|chauffeur|close protection|bodyguard)'`);
const retype = await db.query(`SELECT ${pick},
   CASE WHEN l.title ~* 'adventure park' THEN 'excursion' WHEN l.title ~* '\\mspa\\M|wellness' THEN 'spa' END AS to_type
   ${base} AND l.type='dining' AND (l.title ~* 'ocean world adventure park' OR l.title ~* 'soul spa wellness')`);

const plan = {
  moveToUsvi: moveToUsvi.map((r) => ({ id: r.id, url: `${r.island}/${r.slug}`, title: r.title, address: r.address, islandId: r.island_id, slug: r.slug })),
  pauseElsewhere: elsewhere.map((r) => ({ id: r.id, url: `${r.island}/${r.slug}`, title: r.title, address: r.address, reason: r.reason })),
  pauseSecurity: security.map((r) => ({ id: r.id, url: `${r.island}/${r.slug}`, title: r.title })),
  retype: retype.map((r) => ({ id: r.id, url: `${r.island}/${r.slug}`, title: r.title, from: r.type, to: r.to_type })),
};
summary(SCRIPT, {
  "move BVI -> US Virgin Islands": plan.moveToUsvi.length,
  "pause (not in their destination)": plan.pauseElsewhere.length,
  "pause (security firms as VIP)": plan.pauseSecurity.length,
  "retype": plan.retype.length,
});
console.log("  plan:", outputFile(SCRIPT, "plan", plan));

if (APPLY) {
  const usvi = (await db.query(`SELECT id FROM islands WHERE slug='us-virgin-islands'`))[0];
  if (!usvi) { console.error("us-virgin-islands destination missing"); process.exit(1); }
  const redirects = (await db.query(`SELECT to_regclass('public.listing_slug_redirects') IS NOT NULL AS ok`))[0].ok;
  if (plan.moveToUsvi.length && !redirects) { console.error("listing_slug_redirects is missing: apply migration 0024 first."); process.exit(1); }
  const clash = plan.moveToUsvi.length ? await db.query(`SELECT slug FROM listings WHERE island_id=$1 AND slug = ANY($2::text[])`, [usvi.id, plan.moveToUsvi.map((m) => m.slug)]) : [];
  if (clash.length) { console.error("slug already used on us-virgin-islands:", clash.map((c) => c.slug).join(", ")); process.exit(1); }
  const ids = [...plan.moveToUsvi, ...plan.pauseElsewhere, ...plan.pauseSecurity, ...plan.retype].map((r) => r.id);
  console.log("  backup:", outputFile(SCRIPT, "backup", await db.query(`SELECT * FROM listings WHERE id = ANY($1::uuid[])`, [ids])));
  const statements = [];
  for (const m of plan.moveToUsvi) {
    statements.push([`UPDATE listings SET island_id=$2, updated_at=now() WHERE id=$1::uuid`, [m.id, usvi.id]]);
    statements.push([`INSERT INTO listing_slug_redirects(island_id, slug, target_listing_id, reason) VALUES($1,$2,$3::uuid,'moved')
      ON CONFLICT (island_id, slug) DO UPDATE SET target_listing_id=EXCLUDED.target_listing_id, reason=EXCLUDED.reason`, [m.islandId, m.slug, m.id]]);
  }
  for (const p of [...plan.pauseElsewhere.map((p) => [p.id, "outside_destination"]), ...plan.pauseSecurity.map((p) => [p.id, "not_a_travel_business"])]) {
    statements.push([`UPDATE listings SET status='paused', updated_at=now(),
        type_data=(type_data::jsonb || jsonb_build_object('pausedReason',$2::text,'pausedAt',now()))::json
      WHERE id=$1::uuid AND status='active'`, p]);
  }
  for (const r of plan.retype) statements.push([`UPDATE listings SET type=$2::listing_type, updated_at=now() WHERE id=$1::uuid`, [r.id, r.to]]);
  await db.transaction(statements);
  console.log(`  applied ${statements.length} statements`);
}
