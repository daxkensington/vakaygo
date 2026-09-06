import type Stripe from "stripe";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { bookings, rejectedPaymentRefunds } from "@/drizzle/schema";
import { refundBooking, retrieveBookingRefund } from "@/server/stripe";
import { logger } from "@/lib/logger";

const getDb = () => drizzle(neon(process.env.DATABASE_URL!));
const failed = (status: string | null) => status === "failed" || status === "canceled";
const paymentIdOf = (refund: Stripe.Refund) => typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;

function statusGuard(column: typeof bookings.refundStatus | typeof rejectedPaymentRefunds.refundStatus, status: string | null) {
  // A delayed request must never overwrite a terminal failure, nor move a
  // succeeded card refund back to pending. A later failure can replace success.
  if (failed(status)) return sql`true`;
  return and(sql`coalesce(${column}, '') not in ('failed', 'canceled')`,
    status === "succeeded" ? undefined : sql`coalesce(${column}, '') <> 'succeeded'`);
}

async function recordRejectedRefund(id: string, refund: Stripe.Refund) {
  const db = getDb();
  const [row] = await db.select().from(rejectedPaymentRefunds).where(eq(rejectedPaymentRefunds.id, id)).limit(1);
  if (!row) throw new Error("Rejected payment refund intent is missing");
  if (paymentIdOf(refund) !== row.paymentId || refund.amount !== row.amountCents || refund.currency.toUpperCase() !== row.currency.toUpperCase() ||
    refund.metadata?.vakaygoRefundKey !== "rejected_checkout_" + row.checkoutSessionId ||
    (row.refundId && row.refundId !== refund.id)) throw new Error("Rejected payment refund identity mismatch");
  const status = refund.status;
  const terminalFailure = failed(status);
  await db.update(rejectedPaymentRefunds).set({
    refundId: refund.id, refundStatus: status,
    lastError: terminalFailure ? "Stripe refund " + status + ": " + (refund.failure_reason || "support review required") : null,
    nextAttemptAt: new Date(Date.now() + 5 * 60000), updatedAt: new Date(),
  }).where(and(eq(rejectedPaymentRefunds.id, id), statusGuard(rejectedPaymentRefunds.refundStatus, status)));
  if (terminalFailure) logger.error("Rejected payment refund requires support review", { bookingId: row.bookingId, paymentId: row.paymentId, refundId: refund.id, status });
  return refund;
}

/** Persist the extra payment before contacting Stripe. The booking's original charge is untouched. */
export async function queueRejectedPaymentRefund(input: { bookingId: string; checkoutSessionId: string; paymentId: string; amountCents: number; currency: string }) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || !input.currency) throw new Error("Invalid rejected payment amount");
  const db = getDb();
  await db.insert(rejectedPaymentRefunds).values({ ...input, currency: input.currency.toUpperCase() })
    .onConflictDoNothing({ target: rejectedPaymentRefunds.checkoutSessionId });
  const [row] = await db.select().from(rejectedPaymentRefunds).where(eq(rejectedPaymentRefunds.checkoutSessionId, input.checkoutSessionId)).limit(1);
  if (!row || row.bookingId !== input.bookingId || row.paymentId !== input.paymentId || row.amountCents !== input.amountCents || row.currency !== input.currency.toUpperCase()) {
    throw new Error("Rejected checkout identity changed");
  }
  return retryRejectedPaymentRefund(row.id);
}

/** Stable request key plus provider metadata recovery handles ambiguous network results. */
export async function retryRejectedPaymentRefund(id: string) {
  const db = getDb();
  const [row] = await db.select().from(rejectedPaymentRefunds).where(eq(rejectedPaymentRefunds.id, id)).limit(1);
  if (!row) throw new Error("Rejected payment refund intent is missing");
  if (failed(row.refundStatus) || row.refundStatus === "succeeded") return { status: row.refundStatus, id: row.refundId };
  await db.update(rejectedPaymentRefunds).set({ attempts: sql`${rejectedPaymentRefunds.attempts} + 1`, updatedAt: new Date() }).where(eq(rejectedPaymentRefunds.id, id));
  try {
    const refund = row.refundId ? await retrieveBookingRefund(row.refundId) : await refundBooking({
      paymentIntentId: row.paymentId, amount: row.amountCents, fullRefund: true, idempotencyKey: "rejected_checkout_" + row.checkoutSessionId,
    });
    return await recordRejectedRefund(id, refund);
  } catch (error) {
    await db.update(rejectedPaymentRefunds).set({ lastError: "Stripe refund attempt could not finish; retry scheduled", nextAttemptAt: new Date(Date.now() + 5 * 60000), updatedAt: new Date() })
      .where(and(eq(rejectedPaymentRefunds.id, id), statusGuard(rejectedPaymentRefunds.refundStatus, null)));
    throw error;
  }
}

/** Fetch provider state rather than trusting the order of refund webhook deliveries. */
export async function reconcileProviderRefund(refundId: string) {
  const refund = await retrieveBookingRefund(refundId);
  const paymentId = paymentIdOf(refund);
  if (!paymentId) return;
  const db = getDb();
  const [extra] = await db.select().from(rejectedPaymentRefunds).where(eq(rejectedPaymentRefunds.paymentId, paymentId)).limit(1);
  if (extra) {
    if (extra.refundId !== refund.id && refund.metadata?.vakaygoRefundKey !== "rejected_checkout_" + extra.checkoutSessionId) return;
    await recordRejectedRefund(extra.id, refund);
    return;
  }
  const [booking] = await db.select().from(bookings).where(eq(bookings.paymentId, paymentId)).limit(1);
  // Refunds created manually or before durable cancellation need separate review.
  if (!booking?.cancellationRequestedAt ||
    (booking.refundId !== refund.id && refund.metadata?.vakaygoRefundKey !== "refund_" + booking.id)) return;
  if ((booking.refundId && booking.refundId !== refund.id) ||
    refund.amount !== booking.cancellationRefundCents ||
    refund.currency.toUpperCase() !== (booking.currency || "USD").toUpperCase()) throw new Error("Cancellation refund identity mismatch");
  const terminalFailure = failed(refund.status);
  const fullyRefunded = refund.status === "succeeded" && refund.amount === Math.round(Number(booking.totalAmount) * 100);
  await db.update(bookings).set({
    refundId: refund.id, refundStatus: refund.status, status: fullyRefunded ? "refunded" : "cancelled", updatedAt: new Date(),
  }).where(and(eq(bookings.id, booking.id), eq(bookings.paymentId, paymentId),
    or(isNull(bookings.refundId), eq(bookings.refundId, refund.id)), statusGuard(bookings.refundStatus, refund.status)));
  if (terminalFailure) logger.error("Booking refund requires support review", { bookingId: booking.id, paymentId, refundId: refund.id, status: refund.status, reason: refund.failure_reason });
}
