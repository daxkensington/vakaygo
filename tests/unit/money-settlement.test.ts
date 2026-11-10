// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookingPaymentEligible, PAYMENT_LINK_MAX_AGE_MS } from "@/lib/booking-payment-eligibility";
import { PROVIDER_READINESS_TTL_MS } from "@/server/business-onboarding";
import { TRIP_COMPLETION_GRACE_MS, tripCompletionDue } from "@/lib/trip-completion";

const state = vi.hoisted(() => ({ calls: [] as { text: string; values: unknown[] }[], flag: false, due: [] as { id: string }[], updated: true }));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({
    query: async (text: string, values: unknown[] = []) => {
      state.calls.push({ text, values });
      if (text.includes("feature_flags")) return [{ enabled: state.flag }];
      if (text.startsWith("SELECT b.id")) return state.due;
      if (text.includes("UPDATE bookings")) return state.updated ? [{ id: values[0], traveler_id: "t1", total_amount: "160.00" }] : [];
      return [];
    },
  }),
}));
const award = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/loyalty", () => ({ awardBookingPoints: award }));

beforeEach(() => { state.calls = []; state.flag = false; state.due = [{ id: "b1" }, { id: "b2" }]; state.updated = true; award.mockClear(); process.env.CRON_SECRET = "s"; process.env.DATABASE_URL = "postgres://synthetic"; });
const call = async (query = "") => {
  const { GET } = await import("@/app/api/cron/complete-past-trips/route");
  return GET(new Request(`https://vakaygo.com/api/cron/complete-past-trips${query}`, { headers: { authorization: "Bearer s" } }));
};

describe("trip completion", () => {
  it("waits 48 hours after the trip ends", () => {
    const end = new Date("2026-12-10T00:00:00Z");
    expect(tripCompletionDue({ startDate: end, endDate: null }, new Date(end.getTime() + TRIP_COMPLETION_GRACE_MS - 1))).toBe(false);
    expect(tripCompletionDue({ startDate: new Date("2026-12-01"), endDate: end }, new Date(end.getTime() + TRIP_COMPLETION_GRACE_MS))).toBe(true);
  });
  it("only counts while the flag is off", async () => {
    const body = await (await call()).json();
    expect(body).toMatchObject({ dryRun: true, enabled: false, due: 2 });
    expect(state.calls.some(c => c.text.includes("UPDATE bookings"))).toBe(false);
    expect(award).not.toHaveBeenCalled();
  });
  it("completes due trips with the same guards as the operator button when the flag is on", async () => {
    state.flag = true;
    const body = await (await call()).json();
    expect(body).toMatchObject({ dryRun: false, due: 2, completed: 2 });
    const update = state.calls.find(c => c.text.includes("UPDATE bookings"))!.text;
    for (const guard of ["status='confirmed'", "paid_at IS NOT NULL", "payment_id IS NOT NULL", "cancellation_requested_at IS NULL", "disputes"]) expect(update).toContain(guard);
    expect(award).toHaveBeenCalledWith("t1", "b1", 160);
  });
  it("dryRun=1 never writes even with the flag on", async () => {
    state.flag = true;
    expect((await (await call("?dryRun=1")).json()).dryRun).toBe(true);
    expect(state.calls.some(c => c.text.includes("UPDATE bookings"))).toBe(false);
  });
  it("rejects calls without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/complete-past-trips/route");
    expect((await GET(new Request("https://vakaygo.com/api/cron/complete-past-trips"))).status).toBe(401);
  });
});

describe("payment readiness and payment return", () => {
  it("refreshes Stripe readiness more often than it expires", () => {
    const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string; schedule: string }[];
    const readiness = crons.find(c => c.path === "/api/cron/onboarding-readiness")!;
    const minutes = Number(/^\*\/(\d+) \* \* \* \*$/.exec(readiness.schedule)?.[1]);
    expect(minutes * 60_000).toBeLessThan(PROVIDER_READINESS_TTL_MS);
    expect(crons.some(c => c.path === "/api/cron/complete-past-trips")).toBe(true);
  });
  it("stops offering Pay Now once checkout would refuse it (23 h)", () => {
    const now = Date.parse("2026-12-02T12:00:00Z");
    const booking = { status: "pending", paidAt: null, cancellationRequestedAt: null, operatorId: "o", datesAvailable: true, checkoutSessionId: null, checkoutExpiresAt: null, checkoutStripeAccountId: null, paymentMode: null };
    const eligibility = { eligible: true, operatorId: "o", stripeAccountId: "acct_x" };
    expect(bookingPaymentEligible({ ...booking, createdAt: new Date(now - PAYMENT_LINK_MAX_AGE_MS + 60_000) }, eligibility, now)).toBe(true);
    expect(bookingPaymentEligible({ ...booking, createdAt: new Date(now - PAYMENT_LINK_MAX_AGE_MS - 60_000) }, eligibility, now)).toBe(false);
    expect(bookingPaymentEligible(booking, eligibility, now)).toBe(true);
  });
  it("hub pages show a price only for bookable listings, in the listing's currency", () => {
    expect(readFileSync("server/seo-queries.ts", "utf8")).not.toMatch(/priceAmount: listings\.priceAmount,/);
    for (const page of ["things-to-do-in", "best-hotels", "best-restaurants"]) {
      const source = readFileSync(`app/(marketing)/${page}/[island]/page.tsx`, "utf8");
      expect(source).toContain('formatCurrency(Math.round(parseFloat(listing.priceAmount)), listing.priceCurrency || "USD")');
    }
  });
});
