// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { paidUsdBookingValue, operatorPaidUsdBookingValue, repeatCompletedBookingRate } from "@/server/analytics-metrics";

function fixtureDb() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  const ownedLocal = url.hostname === "127.0.0.1" && url.port === "5498";
  const hostedFixture = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1"
    && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
  if ((!ownedLocal && !hostedFixture) || url.pathname !== "/vakaygo_test" || url.username !== "audit")
    throw new Error("Owned audit or hosted disposable PostgreSQL required");
  return neon(process.env.DATABASE_URL!);
}

it.skipIf(process.env.VAKAYGO_DISCOVERY_DB_TESTS !== "true")("counts paid USD booking value once per operator and calculates repeat travelers from completed bookings", async () => {
  const fixture = sql`WITH users(id) AS (VALUES ('op-a'),('op-b')),
    listings(id,operator_id) AS (VALUES (1,'op-a'),(2,'op-a'),(3,'op-b')),
    bookings(operator_id,traveler_id,paid_at,currency,total_amount,status) AS (VALUES
      ('op-a','traveler-a','paid','USD',10::numeric,'completed'),
      ('op-a','traveler-a','paid','USD',20,'completed'),
      ('op-a','traveler-b','paid','USD',40,'completed'),
      ('op-a','traveler-c','paid','EUR',900,'confirmed'),
      ('op-a','traveler-d',NULL,'USD',500,'pending'),
      ('op-a','traveler-e','paid','USD',50,'cancelled')
    )`;
  const query = new PgDialect().sqlToQuery(sql`${fixture}
    SELECT users.id, count(distinct listings.id)::int AS listing_count,
      ${operatorPaidUsdBookingValue} AS paid_value,
      ${repeatCompletedBookingRate} AS repeat_rate
    FROM users LEFT JOIN listings ON listings.operator_id=users.id GROUP BY users.id ORDER BY users.id`);
  const db = fixtureDb();
  const rows = await db.query(query.sql, query.params) as {
    id: string; listing_count: number; paid_value: string; repeat_rate: number;
  }[];
  expect(rows).toEqual([
    { id: "op-a", listing_count: 2, paid_value: "120", repeat_rate: 50 },
    { id: "op-b", listing_count: 1, paid_value: "0", repeat_rate: 50 },
  ]);
  const sum = new PgDialect().sqlToQuery(sql`${fixture} SELECT sum(${paidUsdBookingValue}) AS value FROM bookings`);
  const total = await db.query(sum.sql, sum.params) as { value: string }[];
  expect(total[0].value).toBe("120");
});

it.skipIf(process.env.VAKAYGO_DISCOVERY_DB_TESTS !== "true")("reports no repeat-booking data rather than a fabricated rate when nobody has completed a booking", async () => {
  const query = new PgDialect().sqlToQuery(sql`WITH bookings(traveler_id,status) AS (
    VALUES ('traveler','pending')) SELECT ${repeatCompletedBookingRate} AS rate`);
  const rows = await fixtureDb().query(query.sql, query.params) as { rate: number | null }[];
  expect(rows[0].rate).toBeNull();
});
