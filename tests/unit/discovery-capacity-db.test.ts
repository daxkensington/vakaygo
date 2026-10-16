// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { stayGuestCapacity } from "@/server/listing-capacity";

// Explicit opt-in against the disposable audit DB; one read-only CTE uses the
// exact production SQL expression, not a JS reimplementation of NULL/cast rules.
it.skipIf(process.env.VAKAYGO_DISCOVERY_DB_TESTS !== "true")("uses the authoritative capacity over stale JSON and safely handles legacy/unknown capacity", async () => {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  const ownedLocal = url.hostname === "127.0.0.1" && url.port === "5498";
  const hostedFixture = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1"
    && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
  if ((!ownedLocal && !hostedFixture) || url.pathname !== "/vakaygo_test" || url.username !== "audit") throw new Error("Owned audit or hosted disposable PostgreSQL required");
  const expression = new PgDialect().sqlToQuery(stayGuestCapacity);
  const db = neon(process.env.DATABASE_URL!);
  const rows = await db.query(`WITH listings(max_guests,type_data,expected) AS (VALUES
    (4,'{}'::jsonb,4),
    (2,'{"maxGuests":10}'::jsonb,2),
    (4,'{"maxGuests":"invalid"}'::jsonb,4),
    (NULL,'{"maxGuests":3}'::jsonb,3),
    (NULL,'{"maxGuests":"invalid"}'::jsonb,NULL),
    (NULL,'{"maxGuests":"999999999999999999"}'::jsonb,NULL),
    (NULL,'{}'::jsonb,NULL)
  ) SELECT ${expression.sql} AS capacity,expected,
    ((${expression.sql}) >= 3) AS matches_three_guests FROM listings`, expression.params) as Array<{ capacity: number | null; expected: number | null; matches_three_guests: boolean | null }>;
  expect(rows).toHaveLength(7);
  for (const row of rows) {
    expect(row.capacity).toBe(row.expected);
    expect(row.matches_three_guests).toBe(row.expected === null ? null : row.expected >= 3);
  }
});
