import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, giftCards, users, listings } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { constructWebhookEvent } from "@/server/stripe";
import { sendBookingConfirmation } from "@/server/email";

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
      case "checkout.session.completed": {
        const session = event.data.object;
        const bookingId = session.metadata?.bookingId;

        // A $0 session completes as "paid" with payment_intent null —
        // that is not a payment. Refuse to confirm anything on it.
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
        if (bookingId && (!paymentIntent || !(session.amount_total && session.amount_total > 0))) {
          logger.warn("Checkout completed without a payment; booking left as is", { bookingId, amountTotal: session.amount_total });
          break;
        }

        if (bookingId) {
          const [paid] = await db
            .update(bookings)
            .set({
              status: "confirmed",
              paymentId: paymentIntent,
              paymentMethod: "card",
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, bookingId))
            .returning({
              bookingNumber: bookings.bookingNumber,
              travelerId: bookings.travelerId,
              listingId: bookings.listingId,
              startDate: bookings.startDate,
              guestCount: bookings.guestCount,
              totalAmount: bookings.totalAmount,
            });

          logger.info("Booking paid", { bookingId });

          // Now — and only now — the traveler gets "Booking Confirmed".
          if (paid) {
            try {
              const [traveler] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, paid.travelerId)).limit(1);
              const [listing] = await db.select({ title: listings.title }).from(listings).where(eq(listings.id, paid.listingId)).limit(1);
              if (traveler?.email) {
                await sendBookingConfirmation({
                  to: traveler.email,
                  travelerName: traveler.name || "Traveler",
                  bookingNumber: paid.bookingNumber,
                  listingTitle: listing?.title || "your booking",
                  startDate: paid.startDate.toISOString(),
                  guestCount: paid.guestCount || 1,
                  totalAmount: parseFloat(paid.totalAmount).toFixed(2),
                });
              }
            } catch (err) {
              logger.error("Booking confirmation email failed", { bookingId, err });
            }
          }
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
        const intent = event.data.object;
        const bookingId = intent.metadata?.bookingId;

        if (bookingId) {
          await db
            .update(bookings)
            .set({
              status: "cancelled",
              cancellationReason: "Payment failed",
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, bookingId));

          logger.warn("Booking payment failed", { bookingId });
        }
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
