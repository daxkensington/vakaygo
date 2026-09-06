import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, giftCards } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { constructWebhookEvent, refundBooking, retrieveCheckoutSession, retrieveBookingPayment, retrieveBookingRefund } from "@/server/stripe";

import { logger } from "@/lib/logger";
/**
 * Stripe webhook handler
 * Receives events when payments succeed, fail, or are refunded
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // Verify webhook signature
    let event;
    try {
      event = constructWebhookEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const announced = event.data.object;
        const bookingId = announced.metadata?.bookingId;
        const paymentId = typeof announced.payment_intent === "string" ? announced.payment_intent : announced.payment_intent?.id;
        if (!bookingId || !paymentId || announced.payment_status !== "paid" || !announced.amount_total) break;
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
        // Shared Stripe accounts can emit unrelated events. Never refund them.
        if (!booking) { logger.warn("Unknown booking checkout needs review", { eventId: event.id, bookingId }); break; }
        // Already-recorded historical payments remain valid and are not reprocessed.
        if (booking.paymentId === paymentId && booking.paidAt) break;
        const session = await retrieveCheckoutSession(announced.id);
        const sessionPaymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        const payment = await retrieveBookingPayment(paymentId);
        if (session.id !== announced.id || session.metadata?.bookingId !== bookingId || sessionPaymentId !== paymentId
          || session.payment_status !== "paid" || session.amount_total !== announced.amount_total || session.currency !== announced.currency
          || session.livemode !== event.livemode || payment.livemode !== event.livemode
          || payment.id !== paymentId || payment.metadata?.bookingId !== bookingId || payment.status !== "succeeded"
          || payment.amount_received !== session.amount_total || payment.currency !== session.currency) {
          throw new Error("Directory checkout provider identity mismatch; retry and support review required");
        }
        // No booking confirmation or email is possible while directory mode is on.
        // Stripe metadata preserves the refund key across retries and the later migration.
        const refund = await refundBooking({ paymentIntentId: paymentId, amount: session.amount_total,
          fullRefund: true, idempotencyKey: "rejected_checkout_" + session.id });
        const refundPaymentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
        if (refundPaymentId !== paymentId || refund.amount !== session.amount_total || refund.currency !== session.currency
          || refund.metadata?.vakaygoRefundKey !== "rejected_checkout_" + session.id) {
          throw new Error("Directory checkout refund identity mismatch; support review required");
        }
        if (refund.status !== "pending" && refund.status !== "succeeded") {
          logger.error("Directory checkout refund requires support review", { bookingId, sessionId: session.id, refundId: refund.id, refundStatus: refund.status });
          throw new Error("Directory checkout refund did not complete; retry and support review required");
        }
        logger.warn("Directory checkout rejected without confirmation", { bookingId, sessionId: session.id, refundId: refund.id, refundStatus: refund.status });
        break;
      }

      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const announced = event.data.object;
        if (!announced.metadata?.vakaygoRefundKey?.startsWith("rejected_checkout_")) break;
        const refund = await retrieveBookingRefund(announced.id);
        const paymentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
        if (!paymentId || refund.metadata?.vakaygoRefundKey !== announced.metadata.vakaygoRefundKey) throw new Error("Directory refund identity mismatch");
        const payment = await retrieveBookingPayment(paymentId);
        const bookingId = payment.metadata?.bookingId;
        if (!bookingId) break;
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
        if (!booking) break;
        if (refund.status !== "pending" && refund.status !== "succeeded") {
          logger.error("Directory checkout refund requires support review", { bookingId, refundId: refund.id, refundStatus: refund.status });
          throw new Error("Directory checkout refund failed; support review required");
        }
        break;
      }

      case "payment_intent.succeeded": {
        // Gift cards are created INACTIVE and only become spendable once
        // Stripe confirms the payment here. Matched by code from metadata;
        // the isActive=false guard makes replays idempotent.
        const intent = event.data.object;
        if (
          intent.metadata?.type === "gift_card" &&
          intent.metadata?.giftCardCode
        ) {
          await db
            .update(giftCards)
            .set({ isActive: true })
            .where(
              and(
                eq(giftCards.code, intent.metadata.giftCardCode),
                eq(giftCards.isActive, false)
              )
            );
          logger.info("Gift card activated", { code: intent.metadata.giftCardCode });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        // Failed attempts cannot cancel or overwrite historical paid bookings.
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent as string;

        // Only mark the booking fully "refunded" when the charge is fully
        // refunded. Our cancel/refund routes issue PARTIAL refunds (and set
        // status='cancelled'); a partial charge.refunded must NOT overwrite
        // that to 'refunded' and misrepresent how much was returned.
        const fullyRefunded =
          charge.refunded === true ||
          (typeof charge.amount_refunded === "number" &&
            typeof charge.amount === "number" &&
            charge.amount_refunded >= charge.amount);

        if (paymentIntentId && fullyRefunded) {
          const [booking] = await db
            .select({ id: bookings.id })
            .from(bookings)
            .where(eq(bookings.paymentId, paymentIntentId))
            .limit(1);

          if (booking) {
            await db
              .update(bookings)
              .set({
                status: "refunded",
                updatedAt: new Date(),
              })
              .where(eq(bookings.id, booking.id));

            logger.info("Booking refunded", { bookingId: booking.id });
          }
        }
        break;
      }

      case "account.updated": {
        // Operator's Stripe account was updated (completed onboarding, etc.)
        const account = event.data.object;
        logger.info("Stripe account updated", {
          accountId: account.id,
          charges: account.charges_enabled,
          payouts: account.payouts_enabled,
        });
        break;
      }

      default:
        logger.warn("Unhandled stripe event type", { type: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("Webhook error", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
