import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, payouts, payoutSchedules, users } from "@/drizzle/schema";
import { eq, and, sql, lte, isNull } from "drizzle-orm";
import { createTransfer } from "@/server/stripe";

import { logger } from "@/lib/logger";
/**
 * GET — Automated weekly payout cron.
 * Runs every Monday at 8 AM UTC. Collects operator earnings from completed
 * bookings that haven't been paid out yet, deducts platform fees, and
 * sends Stripe transfers.
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

    // Get all operator payout schedules
    const schedules = await db
      .select()
      .from(payoutSchedules);

    const results: Array<{
      operatorId: string;
      status: string;
      amount?: number;
      bookingCount?: number;
      error?: string;
    }> = [];

    for (const schedule of schedules) {
      try {
        if (!schedule.stripeAccountId) {
          results.push({
            operatorId: schedule.operatorId,
            status: "skipped",
            error: "No Stripe account configured",
          });
          continue;
        }

        // Find completed bookings for this operator that haven't been paid out
        // A booking is "unpaid" if there's no payout record covering it
        const operatorBookings = await db
          .select({
            id: bookings.id,
            totalAmount: bookings.totalAmount,
            serviceFee: bookings.serviceFee,
            subtotal: bookings.subtotal,
            currency: bookings.currency,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.operatorId, schedule.operatorId),
              eq(bookings.status, "completed"),
              eq(bookings.escrowReleased, true)
            )
          );

        if (operatorBookings.length === 0) {
          results.push({
            operatorId: schedule.operatorId,
            status: "skipped",
            error: "No completed bookings to pay out",
          });
          continue;
        }

        // Calculate total earnings: subtotal minus platform commission (5%)
        let totalEarningsCents = 0;
        const currency = operatorBookings[0]?.currency || "usd";

        for (const b of operatorBookings) {
          const subtotal = parseFloat(b.subtotal || "0");
          const platformCommission = subtotal * 0.05;
          const operatorEarning = subtotal - platformCommission;
          totalEarningsCents += Math.round(operatorEarning * 100);
        }

        const minPayoutCents = Math.round(parseFloat(schedule.minPayout || "10") * 100);
        if (totalEarningsCents < minPayoutCents) {
          results.push({
            operatorId: schedule.operatorId,
            status: "skipped",
            error: `Below minimum payout threshold (${totalEarningsCents / 100} < ${minPayoutCents / 100})`,
          });
          continue;
        }

        // Create Stripe transfer
        const transfer = await createTransfer({
          amount: totalEarningsCents,
          currency,
          destinationAccountId: schedule.stripeAccountId,
          description: `VakayGo payout — ${operatorBookings.length} booking(s)`,
          metadata: {
            operatorId: schedule.operatorId,
            bookingCount: String(operatorBookings.length),
          },
        });

        // Calculate the period covered
        const periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - 7);

        // Insert payout record
        await db.insert(payouts).values({
          operatorId: schedule.operatorId,
          amount: (totalEarningsCents / 100).toFixed(2),
          currency,
          status: "completed",
          periodStart,
          periodEnd: now,
          bookingCount: operatorBookings.length,
          paymentReference: transfer.id,
          paidAt: now,
        });

        results.push({
          operatorId: schedule.operatorId,
          status: "success",
          amount: totalEarningsCents / 100,
          bookingCount: operatorBookings.length,
        });
      } catch (err) {
        results.push({
          operatorId: schedule.operatorId,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      processed: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "error").length,
      total: schedules.length,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Payout cron error", error);
    return NextResponse.json({ error: "Payout cron failed" }, { status: 500 });
  }
}
