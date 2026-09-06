import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  send: vi.fn(async () => ({ error: null })),
  query: vi.fn(),
  neon: vi.fn(),
  booking: {} as Record<string, unknown>,
  kind: "requested",
}));
vi.mock("@neondatabase/serverless", () => ({ neon: state.neon }));
vi.mock("resend", () => ({ Resend: class { emails = { send: state.send }; } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/server/business-onboarding", () => ({ getListingBookingEligibility: vi.fn() }));
vi.mock("@/server/email", () => ({ sendPriceDropAlert: vi.fn() }));
import { GET as bookingMail } from "@/app/api/cron/booking-mail/route";
import { GET as priceAlerts } from "@/app/api/cron/price-alerts/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "synthetic-mail-check");
  vi.stubEnv("RESEND_API_KEY", "re_synthetic_no_delivery");
  vi.stubEnv("BOOKINGS_ENABLED", "true");
  state.kind = "requested";
  state.booking = {
    id: "synthetic-booking", status: "requested", booking_eligible: false,
    title: "Synthetic business", email: "traveler@example.invalid", operator_email: "operator@example.invalid",
    name: "Synthetic traveler", booking_number: "MAIL-CHECK", start_date: new Date("2099-12-01"), guest_count: 1,
    total_amount: "71.50", currency: "USD", cancellation_policy_snapshot: "flexible", cancellation_refund_cents: 0,
  };
  state.query.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("RETURNING *")) return [{ id: "synthetic-job", booking_id: "synthetic-booking", kind: state.kind, recipient: "traveler" }];
    if (text.includes("SELECT b.*")) return [state.booking];
    return [];
  });
  state.neon.mockReturnValue(state.query);
});
afterEach(() => vi.unstubAllEnvs());

const request = () => new Request("https://audit.invalid/api/cron/booking-mail", { headers: { authorization: "Bearer synthetic-mail-check" } });

describe("booking offers in automated mail", () => {
  it.each([
    ["requested", "requested"], ["received", "pending"], ["request_confirmed", "confirmed"], ["confirmed", "confirmed"],
  ])("suppresses %s for a company that is not eligible", async (kind, status) => {
    state.kind = kind;
    state.booking.status = status;
    const response = await bookingMail(request());
    expect(await response.json()).toMatchObject({ delivered: 0, failed: 0, suppressed: 1 });
    expect(state.send).not.toHaveBeenCalled();
  });
  it("suppresses a payment reminder during a global stop even with previously valid company state", async () => {
    vi.stubEnv("BOOKINGS_ENABLED", "false");
    state.kind = "received";
    Object.assign(state.booking, { status: "pending", booking_eligible: true });
    await bookingMail(request());
    expect(state.send).not.toHaveBeenCalled();
  });
  it("preserves the confirmation of a historical paid booking", async () => {
    state.kind = "confirmed";
    Object.assign(state.booking, { status: "confirmed", paid_at: new Date(), booking_eligible: false });
    const response = await bookingMail(request());
    expect(await response.json()).toMatchObject({ delivered: 1, suppressed: 0 });
    expect(state.send).toHaveBeenCalledTimes(1);
  });
  it("does not query or offer price-drop bookings while launch is disabled", async () => {
    vi.stubEnv("BOOKINGS_ENABLED", "false");
    const response = await priceAlerts(request());
    expect(await response.json()).toMatchObject({ checked: 0, alerted: 0 });
    expect(state.neon).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });
});
