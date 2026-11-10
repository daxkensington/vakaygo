/**
 * Made-up guest capacities (audit traveler-ux#3, data half).
 *
 * Imports gave every unclaimed listing its type's default max_guests (stays 4,
 * spas 2, transfers 4, everything else 8). Pages and the Guests filter read it
 * as fact. This sets max_guests to NULL on unclaimed listings whose value is
 * exactly their type default; a value that differs from the default, and every
 * claimed listing, is left alone. A business sets its real capacity when it
 * claims the listing (listing setup already requires it).
 */
import { APPLY, database, outputFile, summary, CLAIMED_SQL } from "./_lib.mjs";

const SCRIPT = "03-default-guest-capacity";
export const TYPE_DEFAULT_GUESTS = { stay: 4, spa: 2, transfer: 4, tour: 8, excursion: 8, dining: 8, event: 8, transport: 8, vip: 8, guide: 8 };

const db = database();
const cases = Object.entries(TYPE_DEFAULT_GUESTS).map(([t, n]) => `(l.type='${t}' AND l.max_guests=${n})`).join(" OR ");
const rows = await db.query(`
  SELECT l.id, l.slug, i.slug island, l.type::text AS type, l.max_guests
    FROM listings l JOIN islands i ON i.id=l.island_id
   WHERE (${cases}) AND NOT ${CLAIMED_SQL}
   ORDER BY l.type, i.slug`);
const byType = {};
for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
summary(SCRIPT, { "listings to clear": rows.length, "by type": JSON.stringify(byType) });
console.log("  plan:", outputFile(SCRIPT, "plan", rows.map((r) => ({ id: r.id, url: `${r.island}/${r.slug}`, type: r.type, maxGuests: r.max_guests }))));

if (APPLY && rows.length) {
  console.log("  backup:", outputFile(SCRIPT, "backup", rows.map((r) => ({ id: r.id, max_guests: r.max_guests }))));
  const statements = [];
  for (const [type, n] of Object.entries(TYPE_DEFAULT_GUESTS)) {
    const ids = rows.filter((r) => r.type === type).map((r) => r.id);
    if (ids.length) statements.push([`UPDATE listings SET max_guests=NULL, updated_at=now() WHERE id = ANY($1::uuid[]) AND max_guests=$2`, [ids, n]]);
  }
  await db.transaction(statements);
  console.log(`  cleared ${rows.length}`);
}
