import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, payouts, payoutSchedules } from "@/drizzle/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { CATEGORY_RATES } from "@/lib/pricing";

import { logger } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET — Weekly payout ledger cron.
 * Runs every Monday at 8 AM UTC.
 *
 * NOTE: this cron moves NO money. Checkout uses Stripe destination
 * charges, so operators receive their share at charge time and Stripe
 * pays out their connected account on its weekly schedule. This cron
 * only writes the payout ledger: it groups each operator's completed,
 * escrow-released, not-yet-recorded bookings into a payouts row and
 * stamps those bookings with payoutId so they are never counted twice.
 * (The old version created a Stripe transfer per run with no
 * idempotency marker — every run re-paid all historical bookings.)
 *
 * Operator earnings use the type-specific operatorFee from
 * lib/pricing.ts, matching what travelers were charged.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));
    const now = new Date();

    const schedules = await db.select().from(payoutSchedules);

    const results: Array<{
      operatorId: string;
      status: string;
      amount?: number;
      bookingCount?: number;
      error?: string;
    }> = [];

    for (const schedule of schedules) {
      try {
        // Completed + escrow-released bookings not yet on any payout record
        const operatorBookings = await db
          .select({
            id: bookings.id,
            subtotal: bookings.subtotal,
            currency: bookings.currency,
            listingType: listings.type,
          })
          .from(bookings)
          .innerJoin(listings, eq(bookings.listingId, listings.id))
          .where(
            and(
              eq(bookings.operatorId, schedule.operatorId),
              eq(bookings.status, "completed"),
              eq(bookings.escrowReleased, true),
              isNull(bookings.payoutId)
            )
          );

        if (operatorBookings.length === 0) {
          results.push({
            operatorId: schedule.operatorId,
            status: "skipped",
            error: "No new completed bookings to record",
          });
          continue;
        }

        // Operator earnings = subtotal minus the type-specific commission
        let totalEarningsCents = 0;
        const currency = operatorBookings[0]?.currency || "usd";

        for (const b of operatorBookings) {
          const rates = CATEGORY_RATES[b.listingType] || CATEGORY_RATES.tour;
          const subtotalCents = Math.round(parseFloat(b.subtotal || "0") * 100);
          const commissionCents = Math.round(subtotalCents * rates.operatorFee);
          totalEarningsCents += subtotalCents - commissionCents;
        }

        const periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - 7);

        // Insert the ledger record first, then claim the bookings. The
        // isNull(payoutId) guard in the UPDATE makes the claim idempotent
        // even if two runs race.
        const [payout] = await db
          .insert(payouts)
          .values({
            operatorId: schedule.operatorId,
            amount: (totalEarningsCents / 100).toFixed(2),
            currency,
            status: "completed",
            periodStart,
            periodEnd: now,
            bookingCount: operatorBookings.length,
            // Funds moved at charge time via destination charge — there is
            // no separate transfer to reference.
            paymentReference: "destination-charge",
            paidAt: now,
          })
          .returning({ id: payouts.id });

        await db
          .update(bookings)
          .set({ payoutId: payout.id, updatedAt: now })
          .where(
            and(
              inArray(
                bookings.id,
                operatorBookings.map((b) => b.id)
              ),
              isNull(bookings.payoutId)
            )
          );

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
