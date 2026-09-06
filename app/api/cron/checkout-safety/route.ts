import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getListingBookingEligibility } from "@/server/business-onboarding";
import { expireBookingCheckout, isBookingCalendarAvailable } from "@/server/booking-checkout-safety";
import { verifyStripePlatformIdentity } from "@/server/stripe";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Persisted payment links are the retry queue, even after activation is revoked. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // A global booking pause must not disable cleanup. Verify the actual account
    // before inspecting or expiring any hosted payment link.
    await verifyStripePlatformIdentity();
    const q = neon(process.env.DATABASE_URL!);
    const candidates = await q`SELECT id,listing_id,operator_id,status,checkout_session_id,checkout_stripe_account_id,payment_mode,cancellation_requested_at
      FROM bookings WHERE paid_at IS NULL AND checkout_session_id IS NOT NULL
        AND (checkout_expires_at IS NULL OR checkout_expires_at>now())
      ORDER BY CASE WHEN status<>'pending' OR cancellation_requested_at IS NOT NULL
        OR NOT vakaygo_listing_bookable(listing_id)
        OR NOT vakaygo_booking_dates_available(listing_id,start_date,end_date,guest_count,id)
        OR payment_mode IS DISTINCT FROM 'destination'
        OR checkout_stripe_account_id IS DISTINCT FROM (SELECT n.stripe_account_id FROM listing_onboarding n WHERE n.listing_id=bookings.listing_id)
        THEN 0 ELSE 1 END,
        created_at ASC LIMIT 50`;
    const result = { checked: 0, closed: 0, paid: 0, eligible: 0, failed: 0 };
    const deadline = Date.now() + 45_000;
    for (let offset = 0; offset < candidates.length && Date.now() < deadline; offset += 5) {
      await Promise.all(candidates.slice(offset, offset + 5).map(async booking => {
        result.checked++;
        try {
          const eligibility = await getListingBookingEligibility(booking.listing_id);
          const eligible = booking.status === "pending" && !booking.cancellation_requested_at && eligibility.eligible
            && eligibility.operatorId === booking.operator_id && !!eligibility.stripeAccountId
            && eligibility.stripeAccountId === booking.checkout_stripe_account_id && booking.payment_mode === "destination"
            && await isBookingCalendarAvailable(booking.id);
          if (eligible) { result.eligible++; return; }
          const outcome = await expireBookingCheckout(booking.id, booking.checkout_session_id);
          if (outcome === "paid") result.paid++;
          else result.closed++;
        } catch (error) {
          result.failed++;
          logger.error("Unavailable checkout expiry needs retry", { bookingId: booking.id, sessionId: booking.checkout_session_id, error });
        }
      }));
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Checkout safety sweep could not verify its platform", error);
    return NextResponse.json({ error: "Checkout safety requires verified provider access" }, { status: 503 });
  }
}
