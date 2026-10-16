// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { publicMapLocations } from "@/server/map-listing-eligibility";

it.skipIf(process.env.VAKAYGO_DISCOVERY_DB_TESTS !== "true")("excludes unroutable legacy pins before pagination and counting while preserving Unicode titles", async () => {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  const ownedLocal = url.hostname === "127.0.0.1" && url.port === "5498";
  const hostedFixture = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1"
    && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
  if ((!ownedLocal && !hostedFixture) || url.pathname !== "/vakaygo_test" || url.username !== "audit")
    throw new Error("Owned audit or hosted disposable PostgreSQL required");
  const db = neon(process.env.DATABASE_URL!);
  // Execute the exact production predicate over read-only CTEs, never live catalogue writes.
  const fixture = `WITH islands(id,slug,name,is_active) AS (VALUES
    (1,'valid-destination','Valid destination',true),(2,'other','Other destination',true),
    (3,'','No slug',true),(4,E'\\t \\n','Whitespace slug',true),
    (5,'no-name','',true),(6,'whitespace-name',E'\\t \\n',true),(7,'inactive','Inactive',false)
  ), cases(label,title,slug,island_id,status,latitude,longitude) AS (VALUES
    ('valid','Valid place','valid-place',1,'active',0::numeric,0::numeric),
    ('unicode-title','Экскурсии в Доминикане от Миши','unicode-title',1,'active',12,-61),
    ('other-destination','Other place','other-place',2,'active',12,-61),
    ('coordinate-boundary','Boundary','boundary',1,'active',90,180),
    ('blank-slug','Legacy import','',1,'active',12,-61),
    ('whitespace-slug','Legacy import',E'\\t \\n',1,'active',12,-61),
    ('blank-title','','blank-title',1,'active',12,-61),
    ('whitespace-title',E'\\t \\n','whitespace-title',1,'active',12,-61),
    ('missing-title',NULL,'missing-title',1,'active',12,-61),
    ('blank-island-slug','Place','place',3,'active',12,-61),
    ('whitespace-island-slug','Place','place',4,'active',12,-61),
    ('blank-island-name','Place','place',5,'active',12,-61),
    ('whitespace-island-name','Place','place',6,'active',12,-61),
    ('inactive-island','Place','place',7,'active',12,-61),
    ('inactive-listing','Place','place',1,'draft',12,-61),
    ('bad-latitude','Place','place',1,'active',91,-61),
    ('bad-longitude','Place','place',1,'active',12,181),
    ('missing-coordinate','Place','place',1,'active',NULL,-61),
    ('blocked-operator','Place','place',1,'active',12,-61)
  ), listings AS (SELECT *,CASE WHEN label='blocked-operator'
    THEN '197d8586-7fd3-4999-91de-a50ad7d70e23'::uuid
    ELSE '81000000-0000-4000-8000-000000000001'::uuid END AS operator_id FROM cases)`;
  for (const [island, expected] of [
    [null, ["coordinate-boundary", "other-destination", "unicode-title", "valid"]],
    ["valid-destination", ["coordinate-boundary", "unicode-title", "valid"]],
  ] as const) {
    const expression = new PgDialect().sqlToQuery(publicMapLocations(island)!);
    const from = `FROM listings JOIN islands ON listings.island_id=islands.id WHERE ${expression.sql}`;
    const rows = await db.query(`${fixture} SELECT label ${from} ORDER BY label`, expression.params) as { label: string }[];
    expect(rows.map(row => row.label)).toEqual(expected);
    const counts = await db.query(`${fixture} SELECT count(*)::int AS count ${from}`, expression.params) as { count: number }[];
    expect(counts[0].count).toBe(expected.length);
  }
});
