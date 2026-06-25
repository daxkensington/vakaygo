import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings } from "@/drizzle/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";

import { logger } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET — Release escrow for completed trips.
 * Runs every 6 hours. Finds bookings that are completed, escrow not yet
 * released, and endDate was more than 48 hours ago, and flips the
 * escrowReleased flag.
 *
 * NOTE: this cron moves NO money. Checkout uses Stripe destination
 * charges (transfer_data.destination + application_fee_amount), so the
 * operator's share lands in their connected account at charge time and
 * Stripe pays it out on their weekly schedule. The escrowReleased flag
 * only marks the end of the 48-hour dispute/refund window for
 * bookkeeping — the old version ALSO created a Stripe transfer here,
 * which would have paid operators twice.
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
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

    const released = await db
      .update(bookings)
      .set({
        escrowReleased: true,
        escrowReleasedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(bookings.status, "completed"),
          eq(bookings.escrowReleased, false),
          // Defense-in-depth: an unpaid booking must never enter the
          // escrow/payout pipeline even if its status was forced to completed.
          isNotNull(bookings.paidAt),
          lt(bookings.endDate, cutoff)
        )
      )
      .returning({ id: bookings.id });

    return NextResponse.json({
      released: released.length,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error("Escrow release cron error", error);
    return NextResponse.json({ error: "Escrow release cron failed" }, { status: 500 });
  }
}
