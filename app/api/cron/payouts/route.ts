import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
/** Records amounts awaiting settlement review. This endpoint moves no money. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== "Bearer "+process.env.CRON_SECRET) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const q=neon(process.env.DATABASE_URL!);
    // One atomic statement claims rows, groups by currency/charge mode, creates
    // pending ledger entries, then attaches exactly those bookings to the entry.
    const rows=await q`WITH eligible AS MATERIALIZED (
      SELECT * FROM bookings WHERE status='completed' AND escrow_released=true AND paid_at IS NOT NULL AND payout_id IS NULL
        AND operator_earnings_cents IS NOT NULL AND payment_mode IN ('platform','destination') AND cancellation_requested_at IS NULL
      FOR UPDATE SKIP LOCKED
    ), groups AS MATERIALIZED (
      SELECT gen_random_uuid() id,operator_id,currency,payment_mode,sum(operator_earnings_cents)/100.0 amount,count(*) booking_count
      FROM eligible GROUP BY operator_id,currency,payment_mode
    ), inserted AS (
      INSERT INTO payouts(id,operator_id,amount,currency,status,period_start,period_end,booking_count,payment_reference)
      SELECT id,operator_id,amount,currency,'pending',now()-interval '7 days',now(),booking_count,
        CASE WHEN payment_mode='destination' THEN 'connect-settlement-review' ELSE 'manual-settlement-required' END FROM groups RETURNING id
    )
    UPDATE bookings b SET payout_id=g.id,updated_at=now() FROM eligible e JOIN groups g ON g.operator_id=e.operator_id AND g.currency=e.currency AND g.payment_mode=e.payment_mode
      JOIN inserted i ON i.id=g.id WHERE b.id=e.id RETURNING b.id,b.payout_id`;
    return NextResponse.json({recorded:rows.length,status:"pending",message:"Settlement must be verified before marking a payout paid."});
  } catch(error) {
    logger.error("Payout ledger failed",error);
    return NextResponse.json({error:"Payout ledger failed"},{status:500});
  }
}
