// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { GRENADA_EXPERIENCE_TOPICS } from "@/lib/grenada-experiences";
import { grenadaExperiencesPredicate, grenadaExperienceTopicPredicate } from "@/server/grenada-experiences";

// Only synthetic read-only CTEs; no application fixtures, schemas or catalogue rows are written.
function ownedFixture() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  const local = ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5498";
  const hosted = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1"
    && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
  if ((!local && !hosted) || url.pathname !== "/vakaygo_test" || url.username !== "audit") {
    throw new Error("Owned local or hosted disposable PostgreSQL required");
  }
  return neon(process.env.DATABASE_URL!);
}
const dialect = new PgDialect();
const cte = `WITH islands(id,slug,name,is_active) AS (VALUES
  (1,'grenada','Grenada',true),(2,'barbados','Barbados',true),
  (3,'grenada','Grenada',false),(4,'grenada','  ',true)
), listings(id,island_id,title,slug,type,status,operator_id,description) AS (VALUES
  ('boat',1,'Harbour Boat Charters','boat','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('sail',1,'Sailing Adventure','sail','excursion','active','00000000-0000-4000-8000-000000000001',''),
  ('jet',1,'JET-SKI Tours','jet','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('jeep',1,'Off-road 4x4 Jeep Tours','jeep','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('snorkel',1,'Snorkelling Grenada','snorkel','excursion','active','00000000-0000-4000-8000-000000000001',''),
  ('hike',1,'Rainforest Hiking Guide','hike','guide','active','00000000-0000-4000-8000-000000000001',''),
  ('falls',1,'Seven Sisters Waterfall Hike','falls','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('plain',1,'Island Guide','plain','guide','active','00000000-0000-4000-8000-000000000001','Boat charters, jeep, jet ski, snorkeling, hiking, waterfalls free every day'),
  ('substring',1,'Boathouse Sailor Jetsetter Hikington Waterfallsman','substring','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('stay',1,'Boat Jet Ski Jeep Snorkeling Hiking Waterfalls Hotel','stay','stay','active','00000000-0000-4000-8000-000000000001',''),
  ('dining',1,'Boat Tours Cafe','dining','dining','active','00000000-0000-4000-8000-000000000001',''),
  ('other',2,'Boat Tours','other','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('inactive-destination',3,'Boat Tours','inactive-destination','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('blank-destination',4,'Boat Tours','blank-destination','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('draft',1,'Boat Tours','draft','tour','draft','00000000-0000-4000-8000-000000000001',''),
  ('demo',1,'Boat Tours','demo','tour','active','197d8586-7fd3-4999-91de-a50ad7d70e23',''),
  ('blank-slug',1,'Boat Tours','   ','tour','active','00000000-0000-4000-8000-000000000001',''),
  ('blank-title',1,'   ','blank-title','tour','active','00000000-0000-4000-8000-000000000001','')
)`;
const join = ' FROM listings INNER JOIN islands ON listings.island_id=islands.id ';

it.skipIf(process.env.VAKAYGO_EXPERIENCES_DB_TESTS !== "true")("selects real-public activity/name matches consistently for all six closed topics", async () => {
  const db = ownedFixture();
  const expected: Record<string, string[]> = {
    "boat-trips": ["boat", "sail"],
    "jet-ski": ["jet"],
    "jeep-tours": ["jeep"],
    snorkeling: ["snorkel"],
    hiking: ["falls", "hike"],
    waterfalls: ["falls"],
  };
  for (const topic of GRENADA_EXPERIENCE_TOPICS) {
    const predicate = dialect.sqlToQuery(grenadaExperiencesPredicate(topic.slug));
    const rows = await db.query(cte + " SELECT listings.id" + join + "WHERE " + predicate.sql + " ORDER BY listings.id", predicate.params) as { id: string }[];
    expect(rows.map((row) => row.id)).toEqual(expected[topic.slug]);
    const counts = await db.query(cte + " SELECT count(*)::int AS count" + join + "WHERE " + predicate.sql, predicate.params) as { count: number }[];
    expect(Number(counts[0].count)).toBe(expected[topic.slug].length);
  }
  const base = dialect.sqlToQuery(grenadaExperiencesPredicate());
  const hub = await db.query(cte + " SELECT listings.id" + join + "WHERE " + base.sql + " ORDER BY listings.id", base.params) as { id: string }[];
  expect(hub.map((row) => row.id)).toEqual(["boat", "falls", "hike", "jeep", "jet", "plain", "sail", "snorkel", "substring"]);
});

it.skipIf(process.env.VAKAYGO_EXPERIENCES_DB_TESTS !== "true")("applies title word boundaries rather than generated prose or partial-name substrings", async () => {
  const db = ownedFixture();
  for (const topic of GRENADA_EXPERIENCE_TOPICS) {
    const compiled = dialect.sqlToQuery(grenadaExperienceTopicPredicate(topic.slug));
    const rows = await db.query(cte + " SELECT listings.id FROM listings WHERE listings.id IN ('plain','substring') AND " + compiled.sql, compiled.params) as { id: string }[];
    expect(rows).toEqual([]);
  }
});
