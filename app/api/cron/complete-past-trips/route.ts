import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { logger } from "@/lib/logger";
import { awardBookingPoints } from "@/server/loyalty";
import { OPEN_DISPUTE_STATUSES, TRIP_AUTO_COMPLETE_FLAG, TRIP_COMPLETION_GRACE_MS } from "@/lib/trip-completion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Completes paid trips that ended at least 48 h ago (lib/trip-completion.ts),
 * so escrow release, the payout ledger and review invitations no longer wait
 * on someone clicking "Mark completed". Off until the feature flag
 * `booking_auto_complete_enabled` is on; `?dryRun=1` (or the flag off) only
 * reports what would complete.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = neon(process.env.DATABASE_URL!);
    const [flag] = await db.query("SELECT enabled FROM feature_flags WHERE key=$1", [TRIP_AUTO_COMPLETE_FLAG]) as { enabled: boolean }[];
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1" || flag?.enabled !== true;
    const graceHours = TRIP_COMPLETION_GRACE_MS / 3_600_000;

    const due = await db.query(
      `SELECT b.id FROM bookings b
        WHERE b.status='confirmed' AND b.paid_at IS NOT NULL AND b.payment_id IS NOT NULL
          AND b.cancellation_requested_at IS NULL
          AND coalesce(b.end_date, b.start_date) <= now() - make_interval(hours => $1::int)
          AND NOT EXISTS(SELECT 1 FROM disputes d WHERE d.booking_id=b.id AND d.status::text = ANY($2::text[]))
        ORDER BY coalesce(b.end_date, b.start_date) LIMIT 200`,
      [graceHours, [...OPEN_DISPUTE_STATUSES]]) as { id: string }[];

    if (dryRun) return NextResponse.json({ dryRun: true, enabled: flag?.enabled === true, due: due.length });

    let completed = 0;
    for (const { id } of due) {
      // Same guard as the operator's "Mark completed": only a confirmed, paid
      // booking with no cancellation pending and no open dispute moves.
      const [row] = await db.query(
        `UPDATE bookings b SET status='completed', updated_at=now()
          WHERE b.id=$1::uuid AND b.status='confirmed' AND b.paid_at IS NOT NULL AND b.payment_id IS NOT NULL
            AND b.cancellation_requested_at IS NULL
            AND NOT EXISTS(SELECT 1 FROM disputes d WHERE d.booking_id=b.id AND d.status::text = ANY($2::text[]))
          RETURNING b.id, b.traveler_id, b.total_amount`,
        [id, [...OPEN_DISPUTE_STATUSES]]) as { id: string; traveler_id: string; total_amount: string }[];
      if (!row) continue;
      completed += 1;
      await awardBookingPoints(row.traveler_id, row.id, parseFloat(row.total_amount)).catch(error => {
        logger.error("Trip completion: loyalty award failed", { bookingId: row.id, error });
      });
    }
    if (completed) logger.info("Trips completed automatically", { completed });
    return NextResponse.json({ dryRun: false, due: due.length, completed });
  } catch (error) {
    logger.error("Trip completion cron failed", { error });
    return NextResponse.json({ error: "Trip completion failed" }, { status: 500 });
  }
}
