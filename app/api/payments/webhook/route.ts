import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { constructWebhookEvent } from "@/server/stripe";

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

        if (bookingId) {
          await db
            .update(bookings)
            .set({
              status: "confirmed",
              paymentId: session.payment_intent as string,
              paymentMethod: "card",
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, bookingId));

          console.log(`Booking ${bookingId} paid — confirmed`);
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

          console.log(`Booking ${bookingId} payment failed — cancelled`);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent as string;

        if (paymentIntentId) {
          // Find booking by payment intent ID and mark as refunded
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

            console.log(`Booking ${booking.id} refunded`);
          }
        }
        break;
      }

      case "account.updated": {
        // Operator's Stripe account was updated (completed onboarding, etc.)
        const account = event.data.object;
        console.log(`Stripe account ${account.id} updated — charges: ${account.charges_enabled}, payouts: ${account.payouts_enabled}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
