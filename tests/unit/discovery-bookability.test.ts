import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const harness = vi.hoisted(() => ({ db: {} as unknown, queries: [] as string[] }));
vi.mock("@/server/db", () => ({ createDb: () => harness.db }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => harness.db }));
vi.mock("@/server/business-onboarding", () => ({
  bookingLaunchEnabled: async () => true,
  getListingBookingEligibility: async () => ({ eligible: true, reason: "ready" }),
}));

import { checkAvailability as conciergeAvailability } from "@/server/concierge-tools";
import { checkAvailability as plannerAvailability } from "@/server/trip-planner-tools";
import { searchListings } from "@/server/listings-search";
import { parseListingFilters } from "@/lib/listing-filters";

const listingId = "20000000-0000-4000-8000-000000000001";
const listing = { id: listingId, title: "Published tour", slug: "published-tour", type: "tour", headline: null,
  priceAmount: "25", priceCurrency: "USD", priceUnit: "person", bookingEligible: true, avgRating: null,
  reviewCount: 0, parish: null, isFeatured: false, islandSlug: "grenada", islandName: "Grenada", latitude: null,
  longitude: null, reviewSource: "vakaygo" };

/** Model the canonical date function's non-stay end-argument contract:
 * null = the published single day; end=start is invalid and returns false.
 * This exercises the SQL emitted by each real discovery caller, not a duplicate helper.
 */
class Query {
  private predicate?: SQL;
  constructor(private selection: Record<string, unknown>, private images = false) {}
  from() { return this; }
  innerJoin() { return this; }
  where(predicate: SQL) { this.predicate = predicate; return this; }
  orderBy() { return this; }
  limit() { return this; }
  offset() { return this; }
  then(resolve: (rows: Record<string, unknown>[]) => unknown, reject?: (cause: unknown) => unknown) {
    const expression = (this.selection.available || this.predicate) as SQL;
    const sql = expression ? new PgDialect().sqlToQuery(expression).sql : "";
    harness.queries.push(sql);
    const available = sql.includes("vakaygo_booking_dates_available") && /ELSE NULL END/i.test(sql);
    const rows = this.images ? [] : this.selection.available ? [{ available }] : available ? [listing] : [];
    return Promise.resolve(rows).then(resolve, reject);
  }
}
beforeEach(() => {
  harness.queries = [];
  harness.db = { select: (fields: Record<string, unknown>) => new Query(fields), selectDistinctOn: (_columns: unknown, fields: Record<string, unknown>) => new Query(fields, true) };
});

it("the concierge can report a valid published tour date using a null non-stay end", async () => {
  expect(await conciergeAvailability({ listingId, date: "2099-12-20" })).toMatchObject({ available: true, bookingEligible: true });
  expect(harness.queries[0]).toMatch(/ELSE NULL END/);
});

it("the itinerary planner can report a valid published tour date", async () => {
  expect(await plannerAvailability(listingId, "2099-12-20")).toMatchObject({ available: true });
  expect(harness.queries[0]).toMatch(/ELSE NULL END/);
});

it("date-filtered search retains an eligible tour instead of passing an invalid zero-length interval", async () => {
  const filters = parseListingFilters(new URLSearchParams({ date: "2099-12-20", type: "tour" }));
  const results = await searchListings(filters);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ id: listingId, priceAmount: "25" });
  expect(harness.queries[0]).toMatch(/ELSE NULL END/);
});
