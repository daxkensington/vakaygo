// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { expect, it } from "vitest";
import { similarListingsQuery } from "@/server/listing-detail";

it.skipIf(process.env.VAKAYGO_DISCOVERY_DB_TESTS !== "true")("ranks all public same-destination/type candidates before limiting, including highly rated rows beyond the first24", async () => {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  const owned = url.hostname === "127.0.0.1" && url.port === "5498";
  const hosted = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
  if ((!owned && !hosted) || url.pathname !== "/vakaygo_test" || url.username !== "audit") throw new Error("Owned audit or hosted disposable PostgreSQL required");
  const db = neon(process.env.DATABASE_URL!);
  const id = (n: number) => `68000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const origin = { id: id(0), type: "tour" as const, islandId: 1 };
  const row = (n: number, extra: Record<string, unknown> = {}) => ({ id: id(n), title: `Owned candidate ${n}`, slug: `owned-${n}`, type: "tour", status: "active", operator_id: "68000000-0000-4000-9000-000000000001", island_id: 1, avg_rating: "1.00", review_count: 1, latitude: "12.05", longitude: "-61.75", ...extra });
  const rows = [row(0, { avg_rating: "5.00" }), ...Array.from({ length: 29 }, (_, index) => row(index + 1)),
    row(30, { avg_rating: "5.00", review_count: 10, latitude: "0", longitude: "0" }),
    row(31, { avg_rating: "5.00", review_count: 20, latitude: "1", longitude: "1" }),
    row(32, { avg_rating: "5.00", review_count: 20 }), row(33, { avg_rating: "4.00", review_count: 100 }),
    row(34, { avg_rating: null, review_count: 10000 }), row(35, { status: "draft", avg_rating: "5.00", review_count: 9999 }),
    row(36, { island_id: 2, avg_rating: "5.00", review_count: 9999 }), row(37, { type: "stay", avg_rating: "5.00", review_count: 9999 }),
    row(38, { slug: " ", avg_rating: "5.00", review_count: 9999 }), row(39, { operator_id: "197d8586-7fd3-4999-91de-a50ad7d70e23", avg_rating: "5.00", review_count: 9999 })];
  const query = similarListingsQuery(drizzle(db), origin).toSQL();
  // Execute the production query over typed, read-only CTE records.
  // No catalogue rows, onboarding state or provider calls are created here.
  const records = query.params.length + 1, active = query.params.length + 2;
  const fixture = `WITH listings AS (SELECT * FROM json_populate_recordset(NULL::public.listings, $${records}::json)), islands(id,slug,name,is_active) AS (VALUES (1,'owned-island','Owned island',$${active}::boolean),(2,'other','Other',true)) `;
  const ranked = await db.query(fixture + query.sql, [...query.params, JSON.stringify(rows), true]) as { id: string }[];
  expect(ranked.map(row => row.id)).toEqual([31, 32, 30, 33, 1, 2].map(id));
  expect(ranked).toHaveLength(6);
  const hidden = await db.query(fixture + query.sql, [...query.params, JSON.stringify(rows), false]);
  expect(hidden).toHaveLength(0);
});