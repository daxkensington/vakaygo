import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings } from "@/drizzle/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { constructWebhookEvent } from "@/server/stripe";
import { checkoutMatchesBooking } from "@/lib/checkout-validation";
import { queueRejectedPaymentRefund, reconcileProviderRefund } from "@/server/payment-refunds";
import { logger } from "@/lib/logger";
import { isBookingCalendarAvailable } from "@/server/booking-checkout-safety";
import {
  getListingBookingEligibility, invalidateStripeAccountReadiness,
  refreshStripeAccountReadiness, revokeStripeAccountReadiness,
} from "@/server/business-onboarding";
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({error:"Missing signature"},{status:400});
  let event;
  try { event = constructWebhookEvent(body,signature,process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return NextResponse.json({error:"Invalid signature"},{status:400}); }
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;
      const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!bookingId || !paymentId || session.payment_status !== "paid" || !session.amount_total) return NextResponse.json({received:true});
      let [booking] = await db.select().from(bookings).where(eq(bookings.id,bookingId)).limit(1);
      if (!booking) throw new Error("Paid checkout references a missing booking");
      if (booking.paymentId === paymentId && booking.paidAt) return NextResponse.json({received:true});
      const eligibility = await getListingBookingEligibility(booking.listingId, { refreshProvider: true });
      const eligible = eligibility.eligible && eligibility.operatorId === booking.operatorId &&
        eligibility.stripeAccountId === booking.checkoutStripeAccountId && booking.paymentMode === "destination" &&
        await isBookingCalendarAvailable(booking.id);
      if (!booking.checkoutSessionId && booking.status === "pending" && eligibility.eligible) throw new Error("Checkout persistence pending");
      if (eligible && booking.status === "pending" && !booking.cancellationRequestedAt && checkoutMatchesBooking(session,booking)) {
        try {
          const [paid] = await db.update(bookings).set({status:"confirmed",paymentId,paymentMethod:"card",paidAt:new Date(),updatedAt:new Date()})
            .where(and(eq(bookings.id,bookingId),eq(bookings.status,"pending"),eq(bookings.checkoutSessionId,session.id),isNull(bookings.paidAt),isNull(bookings.cancellationRequestedAt),sql`vakaygo_listing_bookable(${bookings.listingId})`))
            .returning({id:bookings.id});
          // The database queues one confirmation in the same transaction.
          if (paid) return NextResponse.json({received:true});
        } catch (error) {
          const dbError = error as { cause?: { message?: string }; message?: string };
          // A revocation racing the provider call must produce a durable refund,
          // not endless webhook retries or a booking confirmation.
          if (!/VG_BOOKING:/.test(dbError.cause?.message || dbError.message || "")) throw error;
        }
        [booking] = await db.select().from(bookings).where(eq(bookings.id,bookingId)).limit(1);
        if (booking.paymentId === paymentId && booking.paidAt) return NextResponse.json({received:true});
      }
      // Late, superseded or mismatched payments cannot reopen inventory.
      await queueRejectedPaymentRefund({bookingId,checkoutSessionId:session.id,paymentId,amountCents:session.amount_total,currency:session.currency || ""});
      logger.warn("Paid checkout rejected; refund is tracked separately",{bookingId,sessionId:session.id});
    } else if (event.type === "account.updated") {
      await invalidateStripeAccountReadiness(event.data.object.id);
      await refreshStripeAccountReadiness(event.data.object.id);
    } else if (event.type === "account.application.deauthorized") {
      if (event.account) await revokeStripeAccountReadiness(event.account);
    } else if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
      await reconcileProviderRefund(event.data.object.id);
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentId && (charge.refunded || charge.amount_refunded >= charge.amount)) {
        const [booking] = await db.select().from(bookings).where(eq(bookings.paymentId,paymentId)).limit(1);
        if (booking?.cancellationRequestedAt) {
          const refundId = booking.refundId || charge.refunds?.data.find(refund => refund.metadata?.vakaygoRefundKey === "refund_" + booking.id)?.id;
          if (!refundId) throw new Error("Cancellation refund persistence pending");
          await reconcileProviderRefund(refundId);
        } else {
          await db.update(bookings).set({status:"refunded",updatedAt:new Date()}).where(eq(bookings.paymentId,paymentId));
        }
      }
    }
    // Failed attempts do not cancel bookings: checkout can be retried.
    // Gift purchases are disabled; legacy gift payments need reconciliation.
    return NextResponse.json({received:true});
  } catch (error) {
    logger.error("Webhook processing failed",error);
    return NextResponse.json({error:"Webhook failed; retry required"},{status:500});
  }
}
