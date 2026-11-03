// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ rows: [] as unknown[][], predicates: [] as unknown[], launch: vi.fn(), auth: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireUser: state.auth }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: state.launch }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ select: () => {
  const chain = { from: () => chain, leftJoin: () => chain, innerJoin: () => chain, where: (predicate: unknown) => { state.predicates.push(predicate); return chain; }, limit: async () => state.rows.shift() || [], orderBy: async () => state.rows.shift() || [], then: (resolve: (value: unknown[]) => void) => resolve(state.rows.shift() || []) };
  return chain;
} }) }));
vi.mock("@/lib/image-utils", () => ({ getImageUrl: (url: string) => url }));
import { GET } from "@/app/api/trips/[id]/route";
const tripId = "30000000-0000-4000-8000-000000000001", userId = "10000000-0000-4000-8000-000000000002", listingId = "20000000-0000-4000-8000-000000000001";
const request = () => GET(new Request("https://vakaygo.com/api/trips/" + tripId), { params: Promise.resolve({ id: tripId }) });
beforeEach(() => {
  state.rows = [[{ id: tripId, userId, title: "Private trip", isPublic: false }], [{ id: "item", listingId, customTitle: "Saved activity" }], [{ id: listingId, title: "Directory tour", slug: "directory-tour", priceAmount: "99.00", bookingEligible: false }], []]; state.predicates = [];
  state.auth.mockResolvedValue({ ok: true, userId }); state.launch.mockResolvedValue(false);
});
it("keeps nonbookable directory prices absent after saving and opening the trip", async () => {
  const response = await request(); expect(response.status).toBe(200); expect((await response.json()).items[0].listing.priceAmount).toBeNull();
  const predicate = new PgDialect().sqlToQuery(state.predicates[2] as Parameters<PgDialect["sqlToQuery"]>[0]);
  expect(predicate.params).toEqual(expect.arrayContaining([listingId, "active", true]));
  for (const field of ['"listings"."id"', '"listings"."status"', '"islands"."is_active"', '"listings"."title"', '"listings"."slug"']) expect(predicate.sql).toContain(field);
});
it("represents a removed or inactive saved listing without creating an undefined listing link", async () => {
  state.rows[2] = []; const response = await request(); expect((await response.json()).items[0]).toMatchObject({ customTitle: "Saved activity", listing: null });
});
it("keeps an eligible saved listing's current price when its gate is confirmed", async () => {
  state.launch.mockResolvedValue(true); state.rows[2] = [{ id: listingId, priceAmount: "99.00", bookingEligible: true }];
  expect((await (await request()).json()).items[0].listing.priceAmount).toBe("99.00");
});
