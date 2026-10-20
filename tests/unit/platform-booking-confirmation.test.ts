import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: { userId: "operator", role: "operator" },
  booking: {} as Record<string, unknown>,
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  eligibility: vi.fn(),
  cancel: vi.fn(),
  award: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn(() => ({})) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ select: state.select, update: state.update }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-session" }) }) }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: async () => state.actor }));
vi.mock("@/server/business-onboarding", () => ({ getListingBookingEligibility: state.eligibility }));
vi.mock("@/server/cancel-booking", () => ({ cancelBooking: state.cancel }));
vi.mock("@/server/loyalty", () => ({ awardBookingPoints: state.award }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { PATCH } from "@/app/api/bookings/[bookingId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = { userId: "operator", role: "operator" };
  state.booking = { id: "inquiry", listingId: "listing", travelerId: "traveler", operatorId: "operator",
    status: "requested", paymentId: null, paidAt: null, totalAmount: "0.00", subtotal: "0.00", serviceFee: "0.00" };
  state.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ ...state.booking }] }) }) });
  state.set.mockImplementation((values: Record<string, unknown>) => ({
    where: () => ({ returning: async () => [{ ...state.booking, ...values }] }),
  }));
  state.update.mockReturnValue({ set: state.set });
  state.eligibility.mockResolvedValue({ eligible: true, operatorId: "operator", stripeAccountId: "acct_synthetic" });
  state.cancel.mockResolvedValue({ success: true, status: "cancelled" });
  state.award.mockResolvedValue(undefined);
});

const change = (body: Record<string, unknown>) => PATCH(new Request("https://audit.invalid/api/bookings/inquiry", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ bookingId: "inquiry" }) });

describe("paid platform booking confirmation", () => {
  it.each(["operator", "admin"])("keeps an unpriced inquiry open when %s tries to confirm it", async role => {
    state.actor = { userId: role, role };
    const response = await change({ status: "confirmed", operatorNotes: "We can accommodate this request" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PLATFORM_PAYMENT_REQUIRED" });
    expect(state.booking.status).toBe("requested");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.eligibility).not.toHaveBeenCalled();
    expect(state.award).not.toHaveBeenCalled();
  });

  it.each([{ paymentId: "pi_synthetic" }, { paidAt: new Date() }])("requires both payment receipt fields for an inquiry: %j", async receipt => {
    Object.assign(state.booking, receipt);
    const response = await change({ status: "confirmed" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PLATFORM_PAYMENT_REQUIRED" });
    expect(state.update).not.toHaveBeenCalled();
  });

  it("still permits an inquiry cancellation through the existing cancellation service", async () => {
    const response = await change({ status: "cancelled", reason: "Different plans" });
    expect(response.status).toBe(200);
    expect(state.cancel).toHaveBeenCalledWith("inquiry", { id: "operator", role: "operator" }, "Different plans");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.eligibility).not.toHaveBeenCalled();
  });

  it("preserves the confirmation of a priced, paid platform booking without rewriting its financial record", async () => {
    Object.assign(state.booking, { status: "pending", totalAmount: "85.00", subtotal: "85.00", serviceFee: "0.00",
      paymentId: "pi_synthetic", paidAt: new Date("2026-10-19T18:00:00Z"), paymentMethod: "card" });
    const response = await change({ status: "confirmed" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ booking: { id: "inquiry", status: "confirmed" } });
    expect(state.eligibility).toHaveBeenCalledWith("listing", { refreshProvider: true });
    expect(state.set).toHaveBeenCalledWith({ status: "confirmed", updatedAt: expect.any(Date) });
    expect(state.award).not.toHaveBeenCalled();
  });

  it("continues to reject an ordinary priced booking without a recorded payment", async () => {
    Object.assign(state.booking, { status: "pending", totalAmount: "85.00" });
    const response = await change({ status: "confirmed" });
    expect(response.status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("preserves historical paid completion independently of current listing readiness", async () => {
    Object.assign(state.booking, { status: "confirmed", totalAmount: "85.00", paymentId: "pi_synthetic", paidAt: new Date() });
    state.eligibility.mockResolvedValue({ eligible: false });
    const response = await change({ status: "completed" });
    expect(response.status).toBe(200);
    expect(state.award).toHaveBeenCalledWith("traveler", "inquiry", 85);
    expect(state.eligibility).not.toHaveBeenCalled();
  });

  it("does not complete a historical unpaid request confirmation", async () => {
    state.booking.status = "confirmed";
    const response = await change({ status: "completed" });
    expect(response.status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.award).not.toHaveBeenCalled();
  });
});
