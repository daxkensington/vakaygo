// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { listingPriceInUsd } from "@/server/listing-prices";

// Read-only CTE against the exact discovery SQL expression. No catalogue fixtures or provider calls.
it.skipIf(process.env.VAKAYGO_DISCOVERY_DB_TESTS !== "true")("filters and sorts mixed currencies by USD estimates while excluding unknown or hidden prices", async () => {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  const ownedLocal = url.hostname === "127.0.0.1" && url.port === "5498";
  const hostedFixture = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
  if ((!ownedLocal && !hostedFixture) || url.pathname !== "/vakaygo_test" || url.username !== "audit") throw new Error("Owned audit or hosted disposable PostgreSQL required");
  const db = neon(process.env.DATABASE_URL!);
  const expression = new PgDialect().sqlToQuery(listingPriceInUsd({ USD: 1, EUR: 0.8, XCD: 2.7, GBP: 0, CAD: Infinity, XYZ: 1 }, sql<boolean>`bookable`));
  const cte = `WITH listings(id,price_amount,price_currency,bookable) AS (VALUES
    ('usd',110::numeric,'USD',true),('eur',100::numeric,'EUR',true),('xcd',270::numeric,' xcd ',true),
    ('unknown',1::numeric,'XYZ',true),('missing',1::numeric,NULL,true),('invalid', 'NaN'::numeric,'USD',true),
    ('hidden',1::numeric,'USD',false),('negative',-1::numeric,'USD',true),('invalid-rate',50::numeric,'GBP',true)
  ), normalized AS (SELECT id,${expression.sql} AS usd FROM listings)`;
  const ascending = await db.query(`${cte} SELECT id,usd FROM normalized ORDER BY usd ASC NULLS LAST,id`, expression.params) as { id: string; usd: string | null }[];
  expect(ascending.slice(0, 3).map(row => row.id)).toEqual(["xcd", "usd", "eur"]);
  expect(ascending.slice(0, 3).map(row => Number(row.usd))).toEqual([100, 110, 125]);
  expect(ascending.slice(3).every(row => row.usd === null)).toBe(true);
  const descending = await db.query(`${cte} SELECT id FROM normalized ORDER BY usd DESC NULLS LAST,id`, expression.params) as { id: string }[];
  expect(descending.slice(0, 3).map(row => row.id)).toEqual(["eur", "usd", "xcd"]);
  const filtered = await db.query(`${cte} SELECT id FROM normalized WHERE usd>=100 AND usd<=120 ORDER BY usd`, expression.params) as { id: string }[];
  expect(filtered.map(row => row.id)).toEqual(["xcd", "usd"]);
});
