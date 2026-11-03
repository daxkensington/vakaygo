type BookingPaymentState = {
  status: string; paidAt: Date | null; cancellationRequestedAt: Date | null;
  operatorId: string; datesAvailable: boolean; checkoutSessionId: string | null;
  checkoutExpiresAt: Date | null; checkoutStripeAccountId: string | null; paymentMode: string | null;
};
type ListingPaymentState = {
  eligible: boolean; operatorId: string | null; stripeAccountId: string | null;
  paymentMode?: "destination" | "platform";
};

/** Read APIs and hosted checkout use the same current rail/account binding. */
export function bookingPaymentEligible(booking: BookingPaymentState, eligibility: ListingPaymentState, now = Date.now()): boolean {
  if (booking.status !== "pending" || booking.paidAt || booking.cancellationRequestedAt || !eligibility.eligible ||
    !eligibility.stripeAccountId || eligibility.operatorId !== booking.operatorId || booking.datesAvailable !== true) return false;
  if (!booking.checkoutSessionId) return true;
  const expectedMode = eligibility.paymentMode === "platform" ? "platform" : "destination";
  return !!booking.checkoutExpiresAt && booking.checkoutExpiresAt.getTime() > now &&
    booking.paymentMode === expectedMode && booking.checkoutStripeAccountId === eligibility.stripeAccountId;
}
