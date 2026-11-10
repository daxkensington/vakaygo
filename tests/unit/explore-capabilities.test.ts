// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: true,
  queries: [] as { kind: string; where: SQL; order: SQL[] }[],
  bookableRows: [] as unknown[],
  dataRows: [] as unknown[],
  fail: false,
  db: {} as unknown,
}));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => state.enabled }));
vi.mock("@/server/exchange-rates", () => ({ getExchangeRates: vi.fn(), SUPPORTED_CURRENCIES: ["USD"] }));
vi.mock("@/server/db", () => ({ createDb: () => state.db }));
import { getExploreData, loadExploreCapabilities, searchListings, countListings } from "@/server/listings-search";
import { parseListingFilters } from "@/lib/listing-filters";

class Query {
  predicate: SQL = sql`true`; order: SQL[] = [];
  constructor(private kind: "list" | "count" | "bookable" | "data" | "island") {}
  from() { return this; } innerJoin() { return this; } limit() { return this; } offset() { return this; }
  where(value: SQL) { this.predicate = value; return this; }
  orderBy(...order: SQL[]) { this.order = order; return this; }
  then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
    state.queries.push({ kind: this.kind, where: this.predicate, order: this.order });
    if (state.fail && (this.kind === "bookable" || this.kind === "data")) return Promise.reject(new Error("capability read failed")).then(resolve, reject);
    const rows = this.kind === "count" ? [{ count: 0 }] : this.kind === "bookable" ? state.bookableRows : this.kind === "data" ? state.dataRows : [];
    return Promise.resolve(rows).then(resolve, reject);
  }
}
const filters = (query = "") => parseListingFilters(new URLSearchParams(query));
const compile = (expression: SQL) => new PgDialect().sqlToQuery(expression);

beforeEach(() => {
  state.enabled = true; state.queries = []; state.fail = false;
  state.bookableRows = []; state.dataRows = [{ amenityData: false, durationData: false }];
  state.db = {
    select: (fields: Record<string, unknown>) => new Query("count" in fields ? "count" : "amenityData" in fields ? "data" : "name" in fields ? "island" : "list"),
    selectDistinct: () => new Query("bookable"),
    selectDistinctOn: () => new Query("list"),
  };
});

it("casts the json column before the amenity containment test in both list and count", async () => {
  await searchListings(filters("type=stay&amenities=pool")); await countListings(filters("type=stay&amenities=pool"));
  for (const query of state.queries) {
    const where = compile(query.where);
    expect(where.sql).toContain(`("listings"."type_data")::jsonb->'amenities' @>`);
    expect(where.params).toContain('["pool"]');
  }
});

it("ranks bookable, then ownership-verified listings ahead of the directory under Recommended", async () => {
  await searchListings(filters("island=dominican-republic&type=tour"));
  const order = state.queries[0].order.map((part) => compile(part).sql);
  expect(order[0]).toContain("vakaygo_listing_bookable"); expect(order[0]).toMatch(/DESC$/);
  expect(order[1]).toContain("vakaygo_listing_claim_verified"); expect(order[1]).toMatch(/DESC$/);
  expect(order[2]).toContain('"is_featured"');
});

it("keeps text relevance first and never ranks on bookability while bookings are disabled", async () => {
  state.enabled = false;
  await searchListings(filters("q=sunset cruise"));
  const order = state.queries[0].order.map((part) => compile(part).sql);
  expect(order[0]).toContain("ILIKE");
  expect(order[1]).toContain("vakaygo_listing_claim_verified");
  expect(order.join(" ")).not.toContain("vakaygo_listing_bookable");
});

it("leaves explicit sorts alone", async () => {
  await searchListings(filters("sort=rating"));
  const order = state.queries[0].order.map((part) => compile(part).sql).join(" ");
  expect(order).not.toContain("vakaygo_listing_claim_verified");
});

it("reports no online-booking scope and no optional data for today's catalogue", async () => {
  expect(await loadExploreCapabilities()).toEqual({ bookable: [], amenityData: false, durationData: false });
  const bookable = state.queries.find((query) => query.kind === "bookable")!;
  const where = compile(bookable.where).sql;
  expect(where).toContain('"activated_at" is not null'); expect(where).toContain("vakaygo_listing_bookable");
});

it("lists each destination and type that takes online bookings, and the data flags", async () => {
  state.bookableRows = [{ island: "dominican-republic", type: "tour" }];
  state.dataRows = [{ amenityData: true, durationData: false }];
  expect(await loadExploreCapabilities()).toEqual({ bookable: [{ island: "dominican-republic", type: "tour" }], amenityData: true, durationData: false });
});

it("does not look for bookable listings while bookings are disabled", async () => {
  state.enabled = false; state.bookableRows = [{ island: "dominican-republic", type: "tour" }];
  expect((await loadExploreCapabilities()).bookable).toEqual([]);
  expect(state.queries.some((query) => query.kind === "bookable")).toBe(false);
});

it("still renders the page with the optional controls hidden when the capability read fails", async () => {
  state.fail = true;
  const data = await getExploreData("key", filters("island=grenada"));
  expect(data.capabilities).toEqual({ bookable: [], amenityData: false, durationData: false });
  expect(data.totalCount).toBe(0);
});
