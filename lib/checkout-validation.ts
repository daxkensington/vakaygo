export function checkoutMatchesBooking(session: { id: string; payment_status?: string; amount_total?: number | null; currency?: string | null }, booking: { checkoutSessionId: string | null; totalAmount: string; currency: string | null }): boolean {
  return session.payment_status === "paid" && session.id === booking.checkoutSessionId &&
    Number.isSafeInteger(session.amount_total) && (session.amount_total || 0) > 0 &&
    session.amount_total === Math.round(Number(booking.totalAmount) * 100) &&
    session.currency?.toUpperCase() === (booking.currency || "USD").toUpperCase();
}
