import { describe, expect, it } from "vitest";
import { bookingPaymentEligible } from "@/lib/booking-payment-eligibility";

const now = Date.parse("2026-10-16T18:00:00Z");
const booking = { status: "pending", paidAt: null, cancellationRequestedAt: null, operatorId: "operator", datesAvailable: true,
  checkoutSessionId: "cs_current", checkoutExpiresAt: new Date(now + 60000), checkoutStripeAccountId: "acct_current", paymentMode: "platform" };
const eligibility = { eligible: true, operatorId: "operator", stripeAccountId: "acct_current", paymentMode: "platform" as const };

describe("booking payment resumption", () => {
  it("resumes a current open platform checkout after Stripe cancellation or page reload", () => {
    expect(bookingPaymentEligible(booking, eligibility, now)).toBe(true);
  });
  it("keeps destination checkouts bound to the destination rail", () => {
    expect(bookingPaymentEligible({ ...booking, paymentMode: "destination" }, { ...eligibility, paymentMode: undefined }, now)).toBe(true);
    expect(bookingPaymentEligible(booking, { ...eligibility, paymentMode: undefined }, now)).toBe(false);
    expect(bookingPaymentEligible({ ...booking, paymentMode: "destination" }, eligibility, now)).toBe(false);
  });
  it.each([
    { checkoutStripeAccountId: "acct_old" }, { checkoutExpiresAt: new Date(now) }, { checkoutExpiresAt: null },
    { paidAt: new Date(now) }, { cancellationRequestedAt: new Date(now) }, { status: "requested" }, { status: "cancelled" },
    { datesAvailable: false }, { operatorId: "old-owner" },
  ])("closes invalid booking states %j", update => {
    expect(bookingPaymentEligible({ ...booking, ...update }, eligibility, now)).toBe(false);
  });
  it("requires current launch/account readiness even before a checkout exists", () => {
    const fresh = { ...booking, checkoutSessionId: null };
    expect(bookingPaymentEligible(fresh, eligibility, now)).toBe(true);
    expect(bookingPaymentEligible(fresh, { ...eligibility, eligible: false }, now)).toBe(false);
    expect(bookingPaymentEligible(fresh, { ...eligibility, stripeAccountId: null }, now)).toBe(false);
  });
});
