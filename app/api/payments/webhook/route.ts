import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings } from "@/drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { constructWebhookEvent } from "@/server/stripe";
import { checkoutMatchesBooking } from "@/lib/checkout-validation";
import { queueRejectedPaymentRefund, reconcileProviderRefund } from "@/server/payment-refunds";
import { logger } from "@/lib/logger";
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
      if (!booking.checkoutSessionId && booking.status === "pending") throw new Error("Checkout persistence pending");
      if (booking.paymentId === paymentId && booking.paidAt) return NextResponse.json({received:true});
      if (booking.status === "pending" && !booking.cancellationRequestedAt && checkoutMatchesBooking(session,booking)) {
        const [paid] = await db.update(bookings).set({status:"confirmed",paymentId,paymentMethod:"card",paidAt:new Date(),updatedAt:new Date()})
          .where(and(eq(bookings.id,bookingId),eq(bookings.status,"pending"),eq(bookings.checkoutSessionId,session.id),isNull(bookings.paidAt),isNull(bookings.cancellationRequestedAt)))
          .returning({id:bookings.id});
        // The database queues one confirmation in the same transaction.
        if (paid) return NextResponse.json({received:true});
        [booking] = await db.select().from(bookings).where(eq(bookings.id,bookingId)).limit(1);
        if (booking.paymentId === paymentId && booking.paidAt) return NextResponse.json({received:true});
      }
      // Late, superseded or mismatched payments cannot reopen inventory.
      await queueRejectedPaymentRefund({bookingId,checkoutSessionId:session.id,paymentId,amountCents:session.amount_total,currency:session.currency || ""});
      logger.warn("Paid checkout rejected; refund is tracked separately",{bookingId,sessionId:session.id});
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
