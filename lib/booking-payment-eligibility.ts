type BookingPaymentState = {
  status: string; paidAt: Date | null; cancellationRequestedAt: Date | null;
  operatorId: string; datesAvailable: boolean; checkoutSessionId: string | null;
  checkoutExpiresAt: Date | null; checkoutStripeAccountId: string | null; paymentMode: string | null;
  createdAt?: Date | null;
};

/** Checkout refuses to open a payment page this long after booking (app/api/payments/create-checkout). */
export const PAYMENT_LINK_MAX_AGE_MS = 23 * 3600000;
type ListingPaymentState = {
  eligible: boolean; operatorId: string | null; stripeAccountId: string | null;
  paymentMode?: "destination" | "platform";
};

/** Read APIs and hosted checkout use the same current rail/account binding. */
export function bookingPaymentEligible(booking: BookingPaymentState, eligibility: ListingPaymentState, now = Date.now()): boolean {
  if (booking.status !== "pending" || booking.paidAt || booking.cancellationRequestedAt || !eligibility.eligible ||
    !eligibility.stripeAccountId || eligibility.operatorId !== booking.operatorId || booking.datesAvailable !== true) return false;
  // Past the checkout cutoff "Pay Now" could only fail with a 409; do not offer it.
  if (booking.createdAt && now - booking.createdAt.getTime() > PAYMENT_LINK_MAX_AGE_MS) return false;
  if (!booking.checkoutSessionId) return true;
  const expectedMode = eligibility.paymentMode === "platform" ? "platform" : "destination";
  return !!booking.checkoutExpiresAt && booking.checkoutExpiresAt.getTime() > now &&
    booking.paymentMode === expectedMode && booking.checkoutStripeAccountId === eligibility.stripeAccountId;
}
