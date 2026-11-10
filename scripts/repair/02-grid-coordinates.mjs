/**
 * Made-up coordinates (audit ops-data#2).
 *
 * Suspect points are (a) the exact points still listed in
 * server/data/location-quarantine.json and (b) any active, non-Google listing
 * whose point lies outside the extent of its destination's Google-sourced
 * listings (2nd-98th percentile box) with no Google listing within ~3 km, or carrying the synthetic grid signature
 * seen on 21 Bonaire hotels pinned in the national park.
 *
 *   --write-manifest   add (b) to server/data/location-quarantine.json so pages,
 *                      maps and JSON-LD withhold them at the next deploy (a code
 *                      change, reviewed in git; no database write).
 *   --geocode          look each suspect address up on OpenStreetMap Nominatim
 *                      (free, 1 request a second, ~4 minutes for 220) and propose
 *                      a corrected point. A proposal is accepted only when it is
 *                      inside the destination's Google-sourced extent and matched
 *                      a building/business or a street, not a town or region.
 *   --apply            write accepted proposals (needs --geocode). The quarantine
 *                      check matches the exact observed point, so a corrected
 *                      listing is shown again without editing the manifest.
 */
import fs from "node:fs";
import path from "node:path";
import { APPLY, database, outputFile, summary, CLAIMED_SQL } from "./_lib.mjs";

const SCRIPT = "02-grid-coordinates";
const GEOCODE = process.argv.includes("--geocode");
const WRITE_MANIFEST = process.argv.includes("--write-manifest");
const MANIFEST = path.join(process.cwd(), "server", "data", "location-quarantine.json");
const MARGIN = 0.02; // degrees around the Google-sourced extent
const COUNTRY = { grenada: "gd", bonaire: "bq", aruba: "aw", curacao: "cw", "st-lucia": "lc", barbados: "bb", jamaica: "jm", dominica: "dm" };

if (APPLY && !GEOCODE) { console.error("--apply needs --geocode"); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const quarantined = new Map(manifest.entries.map((e) => [e.id.toLowerCase(), e]));

const db = database();
const extents = await db.query(`
  SELECT l.island_id,
         percentile_cont(0.02) WITHIN GROUP (ORDER BY l.latitude::float) lat0, percentile_cont(0.98) WITHIN GROUP (ORDER BY l.latitude::float) lat1,
         percentile_cont(0.02) WITHIN GROUP (ORDER BY l.longitude::float) lng0, percentile_cont(0.98) WITHIN GROUP (ORDER BY l.longitude::float) lng1, count(*)::int n
    FROM listings l WHERE l.status='active' AND l.type_data->>'source'='google-places' AND l.latitude IS NOT NULL
   GROUP BY 1 HAVING count(*) >= 20`);
const extent = new Map(extents.map((e) => [e.island_id, e]));
// Google-sourced points per destination: a non-Google point with no Google
// neighbour within NEIGHBOUR degrees (~3 km) is in an empty place, which also
// keeps outlying islands such as Carriacou from being flagged.
const NEIGHBOUR = 0.03;
const googlePoints = new Map();
for (const p of await db.query(`SELECT island_id, latitude::float lat, longitude::float lng FROM listings
    WHERE status='active' AND type_data->>'source'='google-places' AND latitude IS NOT NULL AND longitude IS NOT NULL`)) {
  if (!googlePoints.has(p.island_id)) googlePoints.set(p.island_id, []);
  googlePoints.get(p.island_id).push(p);
}
const hasGoogleNeighbour = (islandId, lat, lng) =>
  (googlePoints.get(islandId) || []).some((p) => Math.abs(p.lat - lat) <= NEIGHBOUR && Math.abs(p.lng - lng) <= NEIGHBOUR);
const rows = await db.query(`
  SELECT l.id, l.slug, l.title, l.address, l.latitude::text lat, l.longitude::text lng, l.island_id, i.slug island, i.name island_name,
         coalesce(l.type_data->>'source','') source, ${CLAIMED_SQL} AS claimed
    FROM listings l JOIN islands i ON i.id=l.island_id
   WHERE l.status='active' AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`);

const inside = (e, lat, lng) => e && lat >= e.lat0 - MARGIN && lat <= e.lat1 + MARGIN && lng >= e.lng0 - MARGIN && lng <= e.lng1 + MARGIN;
const suspects = [];
for (const r of rows) {
  const q = quarantined.get(r.id.toLowerCase());
  const inManifest = q && Number(q.latitude) === Number(r.lat) && Number(q.longitude) === Number(r.lng);
  // The synthetic grid seen on Bonaire: latitudes end ...452/...952, longitudes ...145/...645.
  const gridSignature = r.source !== "google-places" && /\.\d{4}(452|952)$/.test(r.lat) && /\.\d{4}(145|645)$/.test(r.lng);
  const outside = r.source !== "google-places" && extent.has(r.island_id)
    && !inside(extent.get(r.island_id), Number(r.lat), Number(r.lng)) && !hasGoogleNeighbour(r.island_id, Number(r.lat), Number(r.lng));
  if (inManifest || outside || gridSignature) suspects.push({ ...r, inManifest: !!inManifest, outsideExtent: outside, gridSignature });
}
// Only the synthetic grid is withheld automatically; a point that is merely far from
// Google-sourced listings (an outlying cove or cay) is listed for a person to check.
const toQuarantine = suspects.filter((s) => !s.inManifest && !s.claimed && s.gridSignature);
const toReview = suspects.filter((s) => !s.inManifest && !s.gridSignature);

const precisionOf = (hit) => {
  if (["building", "amenity", "tourism", "shop", "leisure", "office", "craft", "club"].includes(hit.class)) return "building";
  if (hit.class === "highway") return "street";
  return "area";
};
const proposals = [];
if (GEOCODE) {
  for (const s of suspects.filter((x) => x.inManifest || x.gridSignature)) {
    if (s.claimed || !s.address || s.address.length < 6) { proposals.push({ id: s.id, url: `${s.island}/${s.slug}`, status: "no_address" }); continue; }
    const params = new URLSearchParams({ q: s.address, format: "jsonv2", limit: "1" });
    if (COUNTRY[s.island]) params.set("countrycodes", COUNTRY[s.island]);
    let hit = null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": "VakayGo listing location repair (support@vakaygo.com)" } });
      hit = res.ok ? (await res.json())[0] ?? null : null;
    } catch { hit = null; }
    await new Promise((r) => setTimeout(r, 1100));
    if (!hit) { proposals.push({ id: s.id, url: `${s.island}/${s.slug}`, address: s.address, status: "not_found" }); continue; }
    const lat = Number(hit.lat), lng = Number(hit.lon), precision = precisionOf(hit);
    const ok = inside(extent.get(s.island_id), lat, lng) && precision !== "area";
    proposals.push({ id: s.id, url: `${s.island}/${s.slug}`, address: s.address, from: [s.lat, s.lng], to: [lat.toFixed(7), lng.toFixed(7)], precision, match: hit.display_name, status: ok ? "accepted" : precision === "area" ? "too_vague" : "outside_extent" });
  }
}
const accepted = proposals.filter((p) => p.status === "accepted");

const byIsland = {};
for (const s of suspects) byIsland[s.island] = (byIsland[s.island] || 0) + 1;
summary(SCRIPT, {
  "suspect points": suspects.length,
  "by destination": JSON.stringify(byIsland),
  "already quarantined": suspects.filter((s) => s.inManifest).length,
  "new to quarantine (grid signature)": toQuarantine.length,
  "far from Google listings, to review": toReview.length,
  ...(GEOCODE ? {
    "geocode accepted (building)": accepted.filter((p) => p.precision === "building").length,
    "geocode accepted (street)": accepted.filter((p) => p.precision === "street").length,
    "too vague (town/region only)": proposals.filter((p) => p.status === "too_vague").length,
    "outside destination": proposals.filter((p) => p.status === "outside_extent").length,
    "not found / no address": proposals.filter((p) => p.status === "not_found" || p.status === "no_address").length,
  } : {}),
});
console.log("  plan:", outputFile(SCRIPT, "plan", { suspects: suspects.map(({ claimed, ...s }) => ({ ...s, claimed })), toQuarantine: toQuarantine.map((s) => s.id), toReview: toReview.map((s) => `${s.island}/${s.slug}`), proposals }));

if (WRITE_MANIFEST && toQuarantine.length) {
  for (const s of toQuarantine) manifest.entries.push({ id: s.id, latitude: s.lat, longitude: s.lng });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  manifest: added ${toQuarantine.length} entries to ${MANIFEST}`);
}

if (APPLY && accepted.length) {
  const backup = await db.query(`SELECT id, slug, latitude, longitude, address, updated_at FROM listings WHERE id = ANY($1::uuid[])`, [accepted.map((p) => p.id)]);
  console.log("  backup:", outputFile(SCRIPT, "backup", backup));
  await db.transaction(accepted.map((p) => [
    `UPDATE listings SET latitude=$2, longitude=$3, updated_at=now(),
       type_data=(type_data::jsonb || jsonb_build_object('locationSource','osm-nominatim','locationPrecision',$4::text,'locationFixedAt',now()))::json
     WHERE id=$1::uuid AND latitude::text=$5 AND longitude::text=$6`,
    [p.id, p.to[0], p.to[1], p.precision, p.from[0], p.from[1]],
  ]));
  console.log(`  applied ${accepted.length} coordinate fixes`);
}
