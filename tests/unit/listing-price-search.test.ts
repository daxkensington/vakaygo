// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ enabled: true, rates: vi.fn(), queries: [] as { where: SQL; order: SQL[]; count: boolean }[], db: {} as unknown }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => state.enabled }));
vi.mock("@/server/exchange-rates", () => ({ getExchangeRates: state.rates, SUPPORTED_CURRENCIES: ["USD", "EUR", "XCD"] }));
vi.mock("@/server/db", () => ({ createDb: () => state.db }));
import { searchListings, countListings } from "@/server/listings-search";
import { parseListingFilters } from "@/lib/listing-filters";

class Query {
  predicate: SQL = sql`true`; order: SQL[] = [];
  constructor(private count: boolean) {}
  from() { return this; } innerJoin() { return this; } limit() { return this; } offset() { return this; }
  where(value: SQL) { this.predicate = value; return this; } orderBy(...order: SQL[]) { this.order = order; return this; }
  then(resolve: (value: unknown[]) => unknown) { state.queries.push({ where: this.predicate, order: this.order, count: this.count }); return Promise.resolve(this.count ? [{ count: 0 }] : []).then(resolve); }
}
const filters = (query = "") => parseListingFilters(new URLSearchParams(query));
const compile = (expression: SQL) => new PgDialect().sqlToQuery(expression);
beforeEach(() => {
  vi.clearAllMocks(); state.enabled = true; state.queries = [];
  state.rates.mockResolvedValue({ rates: { USD: 1, EUR: 0.8, XCD: 2.7 } });
  state.db = { select: (fields: Record<string, unknown>) => new Query("count" in fields) };
});

it("does not fetch rates for ordinary discovery or for a count with only price sorting", async () => {
  await searchListings(filters()); await countListings(filters("sort=price-asc"));
  expect(state.rates).not.toHaveBeenCalled(); expect(compile(state.queries[0].where).sql).not.toContain("price_currency");
});
it("uses the same bookable USD conversion in search and count price predicates", async () => {
  await searchListings(filters("minPrice=100&maxPrice=120&sort=price-asc")); await countListings(filters("minPrice=100&maxPrice=120"));
  const one = compile(state.queries[0].where), two = compile(state.queries[1].where);
  expect(one).toEqual(two); expect(one.sql).toContain("vakaygo_listing_bookable");
  expect(one.sql).toContain('"listings"."price_amount"/'); expect(one.params).toContain(0.8);
  const order = compile(state.queries[0].order[0]); expect(order.sql).toContain("CASE"); expect(order.sql).toContain("ASC NULLS LAST");
});
it("normalizes descending price order and leaves missing prices last", async () => {
  await searchListings(filters("sort=price-desc"));
  expect(compile(state.queries[0].order[0]).sql).toContain("DESC NULLS LAST"); expect(state.rates).toHaveBeenCalledTimes(1);
});
it("never filters or sorts on hidden raw prices while bookings are disabled", async () => {
  state.enabled = false; await searchListings(filters("maxPrice=120&sort=price-asc")); await countListings(filters("maxPrice=120"));
  expect(state.rates).not.toHaveBeenCalled();
  for (const query of state.queries) { const where = compile(query.where); expect(where.sql).toContain("NULL::numeric <="); expect(where.sql).not.toContain("price_amount"); }
  expect(compile(state.queries[0].order[0]).sql).toBe("NULL::numeric ASC NULLS LAST");
});
