import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { cancelBooking } from "@/server/cancel-booking";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Retry persisted cancellation intents, including interrupted Stripe responses. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = neon(process.env.DATABASE_URL!);
  const pending = await q`SELECT id, traveler_id FROM bookings
    WHERE status='cancelled' AND cancellation_requested_at IS NOT NULL
      AND cancellation_refund_cents>0 AND payment_id IS NOT NULL
      AND (refund_status IS NULL OR refund_status IN ('pending','requires_action'))
    ORDER BY updated_at LIMIT 20`;
  let processed = 0, failed = 0;
  for (const booking of pending) {
    try {
      const result = await cancelBooking(booking.id, { id: booking.traveler_id, role: "traveler" });
      if ("error" in result) { failed++; logger.error("Refund needs support review", { bookingId: booking.id, error: result.error }); }
      else processed++;
    } catch (error) {
      failed++;
      // Leave the persisted intent eligible for the next run.
      logger.error("Booking refund remains pending", { bookingId: booking.id, error });
    }
  }
  return NextResponse.json({ processed, failed });
}
