// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SessionPayload } from "@/server/session-validation";

const state = vi.hoisted(() => ({ verify: vi.fn(), enabled: false, queries: [] as { table: string; where?: SQL }[], rows: [] as Record<string, unknown>[] }));
vi.mock("@/server/admin-auth", () => ({ verifySession: state.verify }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => state.enabled }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: (selection: Record<string, unknown>) => new Query(selection),
  selectDistinctOn: (_columns: unknown, selection: Record<string, unknown>) => new Query(selection),
}) }));
import { GET as recommendations } from "@/app/api/recommendations/route";
import { GET as recent } from "@/app/api/recommendations/recent/route";

class Query {
  table = ""; predicate?: SQL;
  constructor(private selection: Record<string, unknown>) {}
  from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
  innerJoin() { return this; } leftJoin() { return this; } orderBy() { return this; } limit() { return this; }
  where(predicate: SQL) { this.predicate = predicate; return this; }
  then(resolve: (rows: Record<string, unknown>[]) => unknown) {
    state.queries.push({ table: this.table, where: this.predicate });
    const rows = this.table === "listings" || "viewedAt" in this.selection ? state.rows
      : this.table === "listing_views" ? [{ listingId: "old-place", type: "tour", islandId: 1 }] : [];
    return Promise.resolve(rows).then(resolve);
  }
}
const actor: SessionPayload = { userId: "actor-a", email: "a@example.invalid", role: "traveler", sessionVersion: 2, emailVerified: true };
beforeEach(() => {
  vi.clearAllMocks(); state.verify.mockResolvedValue(actor); state.enabled = false; state.queries = [];
  state.rows = [{ id: "place-a", title: "Public place", slug: "public-place", type: "tour", islandId: 1,
    islandSlug: "grenada", islandName: "Grenada", bookingEligible: false, priceAmount: "350", priceCurrency: "EUR",
    image: null, avgRating: "4.5", isFeatured: false, viewedAt: new Date("2026-10-15") }];
});

it("never reads private recent history for a revoked or missing canonical session", async () => {
  state.verify.mockResolvedValue(null);
  const response = await recent();
  expect(await response.json()).toEqual({ listings: [] });
  expect(state.queries).toEqual([]);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("returns only public, unpriced recommendations to anonymous or revoked sessions", async () => {
  state.verify.mockResolvedValue(null);
  const response = await recommendations(); const body = await response.json();
  expect(body).toMatchObject({ isPersonalized: false, recommended: [{ priceAmount: null, bookingEligible: false, priceCurrency: "EUR" }] });
  expect(state.queries.map(query => query.table)).toEqual(["listings"]);
  expect(new PgDialect().sqlToQuery(state.queries[0].where!).sql).toContain('"islands"."is_active"');
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("returns current-account history with hidden prices while bookings are paused", async () => {
  const response = await recent(); const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.listings).toMatchObject([{ priceAmount: null, priceCurrency: "EUR", bookingEligible: false }]);
  expect(state.verify).toHaveBeenCalledTimes(2);
});

it("preserves source currency and a currently eligible price", async () => {
  state.enabled = true; state.rows[0].bookingEligible = true;
  expect((await (await recommendations()).json()).recommended).toMatchObject([{ priceAmount: "350", priceCurrency: "EUR", bookingEligible: true }]);
});

it.each([null, { ...actor, userId: "actor-b" }, { ...actor, sessionVersion: 3 }, { ...actor, email: "changed@example.invalid" }, { ...actor, role: "operator" }, { ...actor, emailVerified: false }])(
  "discards private results when the current identity changes during either read (%j)", async current => {
    for (const handler of [recommendations, recent]) {
      state.verify.mockReset().mockResolvedValueOnce(actor).mockResolvedValueOnce(current);
      const response = await handler();
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).not.toHaveProperty("listings"); expect(body).not.toHaveProperty("recommended");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  },
);
