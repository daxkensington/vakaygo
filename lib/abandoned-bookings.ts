/**
 * What to do with a PENDING, UNPAID, card booking as time passes.
 *
 * A card booking is created `pending` and only becomes `confirmed` when
 * the Stripe webhook reports payment. Until then nothing is held and
 * nobody has been paid, so:
 *
 *   - after RECOVERY_AFTER_MS with no payment: one "complete your booking"
 *     email (recorded in bookings.recoveryEmailSentAt so it never repeats)
 *   - after EXPIRE_AFTER_MS, or once the start date has passed: cancel it
 *     with an explicit reason and tell the traveler and the operator.
 *
 * Pure so the cron's decisions can be unit-tested; the cron applies the
 * verdict. `requested` bookings (unclaimed/unpriced listings) are NOT in
 * scope — a human confirms or declines those from Admin → Bookings.
 */

export const RECOVERY_AFTER_MS = 2 * 60 * 60 * 1000; // 2 h
export const EXPIRE_AFTER_MS = 48 * 60 * 60 * 1000; // 48 h
export const EXPIRE_AFTER_HOURS = EXPIRE_AFTER_MS / 3_600_000;

export type PendingBookingFacts = {
  status: string;
  paidAt: Date | null;
  paymentMethod: string | null;
  totalAmount: string | number | null;
  createdAt: Date;
  startDate: Date;
  recoveryEmailSentAt: Date | null;
};

export type PendingVerdict = "wait" | "recover" | "expire" | "ignore";

export function classifyPendingBooking(b: PendingBookingFacts, now: Date = new Date()): PendingVerdict {
  // Only unpaid card bookings are "abandoned". Requested bookings have
  // nothing to pay; anything paid or already moved on is someone else's.
  if (b.status !== "pending" || b.paidAt || b.paymentMethod === "none") return "ignore";
  const total = typeof b.totalAmount === "number" ? b.totalAmount : parseFloat(b.totalAmount || "0");
  if (!(total > 0)) return "ignore";

  const age = now.getTime() - b.createdAt.getTime();
  if (age >= EXPIRE_AFTER_MS || b.startDate.getTime() <= now.getTime()) return "expire";
  if (age >= RECOVERY_AFTER_MS && !b.recoveryEmailSentAt) return "recover";
  return "wait";
}

export function expiryReason(): string {
  return `Expired — payment was not completed within ${EXPIRE_AFTER_HOURS} hours of booking`;
}
