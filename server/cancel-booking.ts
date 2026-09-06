import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { bookings, listings, islands } from "@/drizzle/schema";
import { calculateRefundPercent } from "@/lib/cancellation";
import { localBookingNow } from "@/lib/booking-validation";
import { refundBooking, retrieveBookingRefund } from "@/server/stripe";
import { expireBookingCheckout } from "@/server/booking-checkout-safety";
import { logger } from "@/lib/logger";

type CancellationResult = { error: string; httpStatus: number } | { success: true; status: string; refundAmount: number; refundPercent?: number; policy?: string; message?: string };
export async function cancelBooking(bookingId: string, actor: { id: string; role: string }, reason?: unknown): Promise<CancellationResult> {
  const db = drizzle(neon(process.env.DATABASE_URL!));
  let [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return { error: "Booking not found", httpStatus: 404 };
  const business = booking.operatorId === actor.id || actor.role === "admin";
  if (!business && booking.travelerId !== actor.id) return { error: "Forbidden", httpStatus: 403 };
  if (["completed","no_show"].includes(booking.status)) return { error: "This booking has ended. Contact support for a refund review.", httpStatus: 409 };
  if (booking.status === "refunded") return { success: true, status: "refunded", refundAmount: (booking.cancellationRefundCents || 0) / 100 };
  const [listing] = await db.select({ policy: listings.cancellationPolicy, timezone: islands.timezone }).from(listings).innerJoin(islands,eq(listings.islandId,islands.id)).where(eq(listings.id,booking.listingId)).limit(1);
  const policy = booking.cancellationPolicySnapshot || listing?.policy || "moderate";
  if (!booking.cancellationRequestedAt) {
    const percent = business ? 100 : calculateRefundPercent(policy, (booking.startDate.getTime()-localBookingNow(listing?.timezone || null).getTime())/3600000);
    const cents = booking.paymentId ? Math.round(Number(booking.totalAmount)*percent) : 0;
    const [claimed] = await db.update(bookings).set({
      status: "cancelled", cancellationRequestedAt: new Date(), cancellationRefundCents: cents,
      cancellationReason: typeof reason === "string" ? reason.trim().slice(0,500) : "Booking cancelled",
      updatedAt: new Date(),
    }).where(and(eq(bookings.id,bookingId),eq(bookings.status,booking.status),isNull(bookings.cancellationRequestedAt),booking.paidAt ? eq(bookings.paymentId,booking.paymentId!) : isNull(bookings.paidAt))).returning();
    if (claimed) booking = claimed;
    else return cancelBooking(bookingId,actor,reason);
  }
  // State is closed before Stripe is called. Failed calls can be retried using
  // the stored amount; crossing a policy deadline never changes that amount.
  if (booking.checkoutSessionId && !booking.paidAt) {
    try { await expireBookingCheckout(booking.id, booking.checkoutSessionId); }
    catch (error) {
      // The persisted session stays in the independent safety sweep. Cancellation
      // and historical refunds must not fail because provider expiry is unavailable.
      logger.error("Cancelled checkout expiry needs retry", { bookingId: booking.id, sessionId: booking.checkoutSessionId, error });
    }
  }
  const cents = booking.cancellationRefundCents || 0;
  let status = booking.status;
  if (booking.paymentId && cents > 0 && booking.refundStatus !== "succeeded") {
    const refund = booking.refundId ? await retrieveBookingRefund(booking.refundId) : await refundBooking({ paymentIntentId: booking.paymentId, amount: cents,
      fullRefund: cents === Math.round(Number(booking.totalAmount)*100), idempotencyKey: "refund_" + booking.id });
    if (refund.status === "failed" || refund.status === "canceled") {
      // A concurrent success event may already have marked this booking refunded.
      // A terminal failure closes it again, but only for this payment/refund intent.
      const [saved] = await db.update(bookings).set({ status: "cancelled", refundId: refund.id, refundStatus: refund.status, updatedAt: new Date() })
        .where(and(eq(bookings.id,bookingId), eq(bookings.paymentId,booking.paymentId), eq(bookings.cancellationRefundCents,cents),
          or(isNull(bookings.refundId),eq(bookings.refundId,refund.id)))).returning({ id: bookings.id });
      if (!saved) return { error: "Refund identity changed; support review required", httpStatus: 502 };
      return { error: "Refund failed; support review required", httpStatus: 502 };
    }
    status = refund.status === "succeeded" && cents === Math.round(Number(booking.totalAmount)*100) ? "refunded" : "cancelled";
    const [saved] = await db.update(bookings).set({ status, refundId: refund.id, refundStatus: refund.status, updatedAt: new Date() })
      .where(and(eq(bookings.id,bookingId), sql`coalesce(${bookings.refundStatus}, '') not in ('failed', 'canceled')`,
        refund.status === "succeeded" ? undefined : sql`coalesce(${bookings.refundStatus}, '') <> 'succeeded'`)).returning({ status: bookings.status });
    if (!saved) return { error: "Refund status changed; support review required", httpStatus: 502 };
    status = saved.status;
  }
  return { success: true, status, policy, refundAmount: cents / 100, refundPercent: booking.paymentId ? Math.round(cents/Number(booking.totalAmount)) : 0,
    message: cents > 0 ? "Cancellation recorded. Any eligible refund is being processed." : "Booking cancelled." };
}
