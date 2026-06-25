import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, payouts, payoutSchedules } from "@/drizzle/schema";
import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm";
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
              // Defense-in-depth: never pay out an unpaid booking.
              isNotNull(bookings.paidAt),
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

        const currency = operatorBookings[0]?.currency || "usd";
        const periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - 7);

        // Compute the full earnings UPFRONT so the inserted ledger row always
        // carries a correct (never $0.00) amount — if the post-claim
        // reconciliation below ever fails mid-run, the operator is never
        // UNDER-paid. We then claim with an isNull(payoutId) guard + RETURNING
        // so concurrent/retried runs can't double-claim; the loser claims zero
        // rows and deletes its phantom row.
        const earningsFor = (b: { subtotal: string | null; listingType: string }) => {
          const rates = CATEGORY_RATES[b.listingType] || CATEGORY_RATES.tour;
          const subtotalCents = Math.round(parseFloat(b.subtotal || "0") * 100);
          return subtotalCents - Math.round(subtotalCents * rates.operatorFee);
        };

        const fullEarningsCents = operatorBookings.reduce(
          (sum, b) => sum + earningsFor(b),
          0
        );

        const [payout] = await db
          .insert(payouts)
          .values({
            operatorId: schedule.operatorId,
            amount: (fullEarningsCents / 100).toFixed(2),
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

        const claimed = await db
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
          )
          .returning({ id: bookings.id });

        if (claimed.length === 0) {
          // Another run beat us to every booking — remove the phantom row.
          await db.delete(payouts).where(eq(payouts.id, payout.id));
          results.push({
            operatorId: schedule.operatorId,
            status: "skipped",
            error: "Bookings already claimed by a concurrent run",
          });
          continue;
        }

        // If a concurrent run claimed SOME of our rows, reconcile the amount
        // DOWN to only what we actually won. (If this update fails the row is
        // at worst over-stated, never under-stated — far safer than $0.00.)
        let totalEarningsCents = fullEarningsCents;
        if (claimed.length !== operatorBookings.length) {
          const claimedIds = new Set(claimed.map((c) => c.id));
          totalEarningsCents = operatorBookings
            .filter((b) => claimedIds.has(b.id))
            .reduce((sum, b) => sum + earningsFor(b), 0);

          await db
            .update(payouts)
            .set({
              amount: (totalEarningsCents / 100).toFixed(2),
              bookingCount: claimed.length,
            })
            .where(eq(payouts.id, payout.id));
        }

        results.push({
          operatorId: schedule.operatorId,
          status: "success",
          amount: totalEarningsCents / 100,
          bookingCount: claimed.length,
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
