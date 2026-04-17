import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users } from "@/drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { releaseEscrowTransfer } from "@/server/stripe";

import { logger } from "@/lib/logger";
/**
 * GET — Release escrow for completed trips.
 * Runs every 6 hours. Finds bookings that are completed, escrow not yet
 * released, and endDate was more than 48 hours ago. Creates Stripe
 * transfers to operators.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));
    const now = new Date();
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

    // Find eligible bookings
    const eligibleBookings = await db
      .select({
        id: bookings.id,
        operatorId: bookings.operatorId,
        totalAmount: bookings.totalAmount,
        serviceFee: bookings.serviceFee,
        subtotal: bookings.subtotal,
        currency: bookings.currency,
        paymentId: bookings.paymentId,
        endDate: bookings.endDate,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "completed"),
          eq(bookings.escrowReleased, false),
          lt(bookings.endDate, cutoff)
        )
      );

    const results: Array<{
      bookingId: string;
      status: string;
      amount?: number;
      error?: string;
    }> = [];

    for (const booking of eligibleBookings) {
      try {
        if (!booking.paymentId) {
          results.push({
            bookingId: booking.id,
            status: "skipped",
            error: "No payment ID on booking",
          });
          continue;
        }

        // Get operator Stripe account
        const [operator] = await db
          .select({ stripeAccountId: users.digipayMerchantId })
          .from(users)
          .where(eq(users.id, booking.operatorId))
          .limit(1);

        if (!operator?.stripeAccountId) {
          results.push({
            bookingId: booking.id,
            status: "skipped",
            error: "Operator has no Stripe account",
          });
          continue;
        }

        // Calculate operator amount (total minus platform commission)
        const subtotalCents = Math.round(parseFloat(booking.subtotal || "0") * 100);
        const platformCommissionCents = Math.round(subtotalCents * 0.05);
        const operatorAmountCents = subtotalCents - platformCommissionCents;

        // Create Stripe transfer
        await releaseEscrowTransfer({
          paymentIntentId: booking.paymentId,
          amount: operatorAmountCents,
          destinationAccountId: operator.stripeAccountId,
        });

        // Mark escrow as released
        await db
          .update(bookings)
          .set({
            escrowReleased: true,
            escrowReleasedAt: now,
            updatedAt: now,
          })
          .where(eq(bookings.id, booking.id));

        results.push({
          bookingId: booking.id,
          status: "success",
          amount: operatorAmountCents / 100,
        });
      } catch (err) {
        results.push({
          bookingId: booking.id,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      released: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "error").length,
      total: eligibleBookings.length,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Escrow release cron error", error);
    return NextResponse.json({ error: "Escrow release cron failed" }, { status: 500 });
  }
}
