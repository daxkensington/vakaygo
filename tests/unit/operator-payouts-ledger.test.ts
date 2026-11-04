import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({ auth: vi.fn(), profiles: vi.fn(), responses: [] as unknown[][], queries: [] as unknown[], selections: [] as Record<string, unknown>[], starts: 0 }));
vi.mock("@/server/admin-auth", () => ({ requireOperator: state.auth }));
vi.mock("@/server/payout-profiles", () => ({ getOperatorPayoutListings: state.profiles }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: (selection: Record<string, unknown>) => {
    state.starts++; state.selections.push(selection);
    const result = state.responses.shift() || [];
    const chain = {
      from: () => chain, innerJoin: () => chain,
      where: (condition: unknown) => { state.queries.push(condition); return chain; },
      orderBy: () => chain, limit: () => chain,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  },
}) }));

import { GET } from "@/app/api/operator/payouts/route";
const ownerId = "10000000-0000-4000-8000-000000000001";
const compile = (condition: unknown) => new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
const earning = (operatorEarningsCents: number | null, currency: string | null = "USD") => ({ operatorEarningsCents, currency, subtotal: "100.00", listingType: "tour" });
const detail = (operatorEarningsCents: number | null, currency: string | null = "USD") => ({ ...earning(operatorEarningsCents, currency), bookingNumber: "SYNTHETIC", listingTitle: "Synthetic tour", totalAmount: "10.00", serviceFee: "0.00", updatedAt: "2099-01-02T00:00:00Z" });

beforeEach(() => {
  state.auth.mockReset().mockResolvedValue({ ok: true, userId: ownerId });
  state.profiles.mockReset().mockResolvedValue([]);
  state.responses = []; state.queries = []; state.selections = []; state.starts = 0;
});

it("uses the recorded discounted earnings rather than applying today's rates to the original subtotal", async () => {
  state.responses = [[earning(1000)], [earning(7000)], [{ amount: "2.25", currency: "USD" }], [], [detail(1000)]];
  const result = await GET();
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await result.json()).toMatchObject({ totalEarned: 10, pendingAmount: 70, availableBalance: 7.75, summaryCurrency: "USD", recentEarnings: [{ totalAmount: 10, netAmount: 10, currency: "USD" }] });
  expect(state.selections[0]).toHaveProperty("operatorEarningsCents");
  expect(state.selections[0]).not.toHaveProperty("subtotal");
});

it("preserves historical recorded earnings when the current tour commission would produce a different amount", async () => {
  state.responses = [[earning(7001), earning(1999)], [], [], [], [detail(7001)]];
  expect(await (await GET()).json()).toMatchObject({ totalEarned: 90, pendingAmount: 0, availableBalance: 90, recentEarnings: [{ netAmount: 70.01 }] });
});

it("keeps missing legacy earnings unknown instead of inventing a current-rate amount or zero", async () => {
  state.responses = [[earning(null), earning(8500)], [earning(null)], [], [], [detail(null)]];
  expect(await (await GET()).json()).toMatchObject({ totalEarned: null, availableBalance: null, pendingAmount: null, missingEarnings: { completed: 1, confirmed: 1 }, recentEarnings: [{ netAmount: null }] });
});

it("retains a recorded zero as known earnings", async () => {
  state.responses = [[earning(0)], [earning(0)], [], [], [detail(0)]];
  expect(await (await GET()).json()).toMatchObject({ totalEarned: 0, availableBalance: 0, pendingAmount: 0, missingEarnings: { completed: 0, confirmed: 0 }, recentEarnings: [{ netAmount: 0 }] });
});

it("retains a single recorded currency for both earnings and completed payout amounts", async () => {
  state.responses = [[earning(10000, "EUR")], [], [{ amount: "25.01", currency: "EUR" }], [{ id: "payout", amount: "25.01", currency: "EUR", status: "completed" }], [detail(10000, "EUR")]];
  expect(await (await GET()).json()).toMatchObject({ totalEarned: 100, availableBalance: 74.99, summaryCurrency: "EUR", currencyReviewRequired: false, payouts: [{ amount: 25.01, currency: "EUR" }], recentEarnings: [{ currency: "EUR" }] });
});

it.each([
  { completed: [earning(10000, "EUR"), earning(10000, "USD")], paid: [] },
  { completed: [earning(10000, "EUR")], paid: [{ amount: "25.00", currency: "USD" }] },
  { completed: [earning(10000, null)], paid: [] },
])("does not combine mixed or unrecorded currencies in summary totals", async ({ completed, paid }) => {
  state.responses = [completed, [], paid, [], []];
  expect(await (await GET()).json()).toMatchObject({ totalEarned: null, availableBalance: null, pendingAmount: null, summaryCurrency: null, currencyReviewRequired: true });
});

it("scopes every earnings and ledger query to the authenticated operator and keeps the existing status boundaries", async () => {
  state.responses = [[], [], [], [], []];
  await GET();
  expect(state.queries.map(compile).map(({ params }) => params)).toEqual([[ownerId, "completed"], [ownerId, "confirmed"], [ownerId, "completed"], [ownerId], [ownerId, "completed"]]);
  expect(state.profiles).toHaveBeenCalledWith(ownerId);
});

it("rejects an invalid operator session before accessing private earnings or payout profiles", async () => {
  state.auth.mockResolvedValue({ ok: false, error: new Response(null, { status: 401 }) });
  expect((await GET()).status).toBe(401);
  expect(state.starts).toBe(0); expect(state.profiles).not.toHaveBeenCalled();
});
