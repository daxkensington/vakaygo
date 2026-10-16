import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ enabled: false, rows: [] as unknown[], queries: [] as string[], limits: [] as number[], count: 8038 }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => state.enabled }));
vi.mock("@/server/db", () => ({ createDb: () => ({ select: (fields: Record<string, unknown>) => ({ from: () => ({ innerJoin: () => ({ where: (where: Parameters<PgDialect["sqlToQuery"]>[0]) => {
  state.queries.push(new PgDialect().sqlToQuery(where).sql);
  if ("count" in fields) return Promise.resolve([{ count: state.count }]);
  return { orderBy: () => ({ limit: (limit: number) => { state.limits.push(limit); return Promise.resolve(state.rows); } }) };
} }) }) }) }) }));
import { getMapListingPage } from "@/server/map-listings";
import { MAP_PAGE_BYTE_LIMIT } from "@/lib/map-listings";

const row = (number: number) => ({ id: `00000000-0000-0000-0000-${number.toString(16).padStart(12, "0")}`, title: `Pin ${number}`, slug: `pin-${number}`, type: "tour", islandSlug: "grenada", islandName: "Grenada", latitude: "12.1", longitude: "-61.7", bookingEligible: false, priceAmount: "350", priceCurrency: "EUR", priceUnit: "trip", avgRating: null, reviewCount: 0, parish: null, isFeatured: false, image: null });
beforeEach(() => { state.enabled = false; state.rows = []; state.queries = []; state.limits = []; });

it("bounds the query, uses one lookahead row, returns an honest map count and strips ineligible prices", async () => {
  state.rows = Array.from({ length: 251 }, (_, index) => row(index + 1));
  const page = await getMapListingPage(null, null);
  expect(state.limits).toEqual([251]); expect(page.listings).toHaveLength(250);
  expect(page.nextCursor).toBe(row(250).id); expect(page.totalCount).toBe(8038);
  expect(page.listings.every(listing => listing.priceAmount === null && listing.priceCurrency === "EUR")).toBe(true);
  expect(state.queries.every(query => query.includes('"islands"."is_active"'))).toBe(true);
});

it("uses a keyset cursor and destination scope for later pages without recounting the directory", async () => {
  state.enabled = true; state.rows = [{ ...row(251), bookingEligible: true }];
  const page = await getMapListingPage("grenada", row(250).id);
  expect(state.queries).toHaveLength(1); expect(state.queries[0]).toContain('"listings"."id" >');
  expect(state.queries[0]).toContain('"islands"."slug" ='); expect(page.totalCount).toBeNull(); expect(page.nextCursor).toBeNull();
  expect(page.listings[0]).toMatchObject({ priceAmount: "350", priceCurrency: "EUR", bookingEligible: true });
  expect(state.limits).toEqual([1001]);
});

it("uses a bounded1001-row lookahead for directory continuations and returns only1000 pins", async () => {
  state.rows = Array.from({ length: 1001 }, (_, index) => row(index + 251));
  const page = await getMapListingPage(null, row(250).id);
  expect(state.limits).toEqual([1001]); expect(state.queries).toHaveLength(1);
  expect(page.listings).toHaveLength(1000); expect(page.nextCursor).toBe(row(1250).id);
  expect(page.totalCount).toBeNull(); expect(page.listings.every(listing => listing.priceAmount === null)).toBe(true);
});

it("returns the final partial continuation without an extra empty read", async () => {
  state.rows = Array.from({ length: 787 }, (_, index) => row(index + 7251));
  const page = await getMapListingPage(null, row(7250).id);
  expect(state.limits).toEqual([1001]); expect(page.listings).toHaveLength(787);
  expect(page.listings.at(-1)!.id).toBe(row(8037).id); expect(page.nextCursor).toBeNull();
});

it("uses bounded continuations while rechecking launch and per-listing readiness on each request", async () => {
  state.enabled = true; state.rows = Array.from({ length: 1001 }, (_, index) => ({ ...row(index + 251), bookingEligible: true }));
  const page = await getMapListingPage(null, row(250).id);
  expect(state.limits).toEqual([1001]); expect(page.listings).toHaveLength(1000); expect(page.nextCursor).toBe(row(1250).id);
  expect(page.listings.every(listing => listing.bookingEligible && listing.priceAmount === "350")).toBe(true);
  state.enabled = false; state.rows = Array.from({ length: 1001 }, (_, index) => row(index + 1251));
  const paused = await getMapListingPage(null, row(1250).id);
  expect(state.limits).toEqual([1001, 1001]);
  expect(paused.listings.every(listing => !listing.bookingEligible && listing.priceAmount === null)).toBe(true);
});

it("keeps long-photo payloads within the byte ceiling and resumes after the last delivered pin", async () => {
  state.rows = Array.from({ length: 1001 }, (_, index) => ({ ...row(index + 251), image: `https://example.invalid/${"x".repeat(1600)}/${index}` }));
  const page = await getMapListingPage(null, row(250).id);
  expect(page.listings.length).toBeGreaterThan(0); expect(page.listings.length).toBeLessThan(1000);
  expect(Buffer.byteLength(JSON.stringify(page), "utf8")).toBeLessThanOrEqual(MAP_PAGE_BYTE_LIMIT);
  expect(page.nextCursor).toBe(page.listings.at(-1)!.id);
  expect(page.nextCursor).not.toBe(row(1250).id);
});

it("keeps a location whose single thumbnail exceeds the entire payload ceiling", async () => {
  state.rows = [{ ...row(251), image: `https://example.invalid/${"x".repeat(MAP_PAGE_BYTE_LIMIT + 100)}` }];
  const page = await getMapListingPage(null, row(250).id);
  expect(page.listings).toHaveLength(1); expect(page.listings[0]).toMatchObject({ id: row(251).id, image: null });
  expect(page.nextCursor).toBeNull(); expect(Buffer.byteLength(JSON.stringify(page), "utf8")).toBeLessThan(MAP_PAGE_BYTE_LIMIT);
});
