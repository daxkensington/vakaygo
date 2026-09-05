import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull } from "drizzle-orm";
import { bookings, listings, islands } from "@/drizzle/schema";
import { calculateRefundPercent } from "@/lib/cancellation";
import { localBookingNow } from "@/lib/booking-validation";
import { refundBooking, expireCheckoutSession } from "@/server/stripe";

type CancellationResult = { error: string; httpStatus: number } | { success: true; status: string; refundAmount: number; refundPercent?: number; policy?: string; message?: string };
export async function cancelBooking(bookingId: string, actor: { id: string; role: string }, reason?: unknown): Promise<CancellationResult> {
  const db = drizzle(neon(process.env.DATABASE_URL!));
  let [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return { error: "Booking not found", httpStatus: 404 };
  const business = booking.operatorId === actor.id || actor.role === "admin";
  if (!business && booking.travelerId !== actor.id) return { error: "Forbidden", httpStatus: 403 };
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
  if (booking.checkoutSessionId && !booking.paidAt) await expireCheckoutSession(booking.checkoutSessionId);
  const cents = booking.cancellationRefundCents || 0;
  let status = booking.status;
  if (booking.paymentId && cents > 0 && !booking.refundId) {
    const refund = await refundBooking({ paymentIntentId: booking.paymentId, amount: cents,
      fullRefund: cents === Math.round(Number(booking.totalAmount)*100), idempotencyKey: "refund_" + booking.id });
    if (refund.status === "failed" || refund.status === "canceled") throw new Error("Refund failed; support review required");
    status = refund.status === "succeeded" && cents === Math.round(Number(booking.totalAmount)*100) ? "refunded" : "cancelled";
    await db.update(bookings).set({ status, refundId: refund.id, updatedAt: new Date() }).where(eq(bookings.id,bookingId));
  }
  return { success: true, status, policy, refundAmount: cents / 100, refundPercent: booking.paymentId ? Math.round(cents/Number(booking.totalAmount)) : 0,
    message: cents > 0 ? "Cancellation recorded. Track refund status in your booking." : "Booking cancelled." };
}
