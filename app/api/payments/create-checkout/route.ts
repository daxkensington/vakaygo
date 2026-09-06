import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { createCheckoutSession, retrieveCheckoutSession } from "@/server/stripe";
import { CATEGORY_RATES } from "@/lib/pricing";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import { getListingBookingEligibility } from "@/server/business-onboarding";
import { expireBookingCheckout, isBookingCalendarAvailable } from "@/server/booking-checkout-safety";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function checkoutReturnUrl(outcome: "paid" | "cancelled", bookingNumber: string): string {
  let origin = "https://vakaygo.com";
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_APP_URL || origin);
    if (configured.protocol === "https:" && !configured.username && !configured.password) origin = configured.origin;
  } catch {
    // An absent or invalid deployment URL keeps the production fallback.
  }
  const url = new URL("/bookings", origin);
  url.searchParams.set(outcome, bookingNumber);
  return url.toString();
}

export async function POST(request: Request) {
  let createdCheckout: { bookingId: string; sessionId: string } | undefined;
  try {
    // Verify auth
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Get booking details
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking || booking.travelerId !== payload.id) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.paidAt) {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    // A price request is not a payable booking.
    if (booking.status === "requested") {
      return NextResponse.json(
        { error: "There is no payment available for this request." },
        { status: 409 }
      );
    }
    if (booking.status !== "pending" || booking.cancellationRequestedAt) {
      return NextResponse.json(
        { error: "This booking has expired or been cancelled — please book again." },
        { status: 409 }
      );
    }
    if (Math.round(parseFloat(booking.totalAmount || "0") * 100) <= 0) {
      return NextResponse.json({ error: "Nothing to pay for this booking" }, { status: 409 });
    }

    // Check before reusing an already-issued link as well as before creating one.
    const eligibility = await getListingBookingEligibility(booking.listingId, { refreshProvider: true });
    if (!eligibility.eligible || !eligibility.stripeAccountId || eligibility.operatorId !== booking.operatorId) {
      if (booking.checkoutSessionId) await expireBookingCheckout(booking.id, booking.checkoutSessionId);
      return NextResponse.json({ error: "This business is not accepting bookings on VakayGo yet.", code: "BOOKING_UNAVAILABLE" }, { status: 409 });
    }
    if (!await isBookingCalendarAvailable(booking.id)) {
      if (booking.checkoutSessionId) await expireBookingCheckout(booking.id, booking.checkoutSessionId);
      return NextResponse.json({ error: "The business has not made these dates available.", code: "BOOKING_UNAVAILABLE" }, { status: 409 });
    }

    if (booking.checkoutSessionId) {
      const existingSession = await retrieveCheckoutSession(booking.checkoutSessionId);
      if (booking.paymentMode !== "destination" || booking.checkoutStripeAccountId !== eligibility.stripeAccountId || existingSession.metadata?.bookingId !== booking.id) {
        await expireBookingCheckout(booking.id, booking.checkoutSessionId);
        return NextResponse.json({ error: "This checkout is no longer available." }, { status: 409 });
      }
      if (existingSession.status !== "open") return NextResponse.json({ error: "This checkout is closed. Check My Bookings before trying again." }, { status: 409 });
      return NextResponse.json({ url: existingSession.url });
    }
    if (Date.now() - booking.createdAt.getTime() > 23 * 3600000) return NextResponse.json({ error: "This payment link has expired. Cancel this unpaid booking and book again." }, { status: 409 });

    // Get listing and operator
    const [listing] = await db
      .select({ title: listings.title, operatorId: listings.operatorId, type: listings.type })
      .from(listings)
      .where(eq(listings.id, booking.listingId))
      .limit(1);

    if (!listing || listing.operatorId !== eligibility.operatorId) {
      return NextResponse.json({ error: "This booking is no longer payable" }, { status: 409 });
    }
    const operatorStripeId = eligibility.stripeAccountId;

    const totalCents = Math.round(parseFloat(booking.totalAmount || "0") * 100);
    // Platform keeps the traveler service fee plus the type-specific
    // operator commission — must match lib/pricing.ts or the operator's
    // displayed earnings diverge from what actually lands in their account.
    const rates = CATEGORY_RATES[listing?.type || "tour"] || CATEGORY_RATES.tour;
    const originalPlatformFeeCents = Math.round(
      (parseFloat(booking.serviceFee || "0") +
        parseFloat(booking.subtotal || "0") * rates.operatorFee) * 100
    );

    const operatorEarningsCents = Math.min(totalCents, Math.max(0, Math.round((Number(booking.subtotal) + Number(booking.serviceFee)) * 100) - originalPlatformFeeCents));
    const platformFeeCents = Math.max(0, totalCents - operatorEarningsCents);

    const [traveler] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, payload.id as string))
      .limit(1);

    const session = await createCheckoutSession({
      amount: totalCents,
      currency: booking.currency || "usd",
      platformFee: platformFeeCents,
      operatorStripeAccountId: operatorStripeId,
      bookingId: booking.id,
      listingTitle: listing?.title || "VakayGo Booking",
      travelerEmail: traveler?.email || "",
      successUrl: checkoutReturnUrl("paid", booking.bookingNumber),
      cancelUrl: checkoutReturnUrl("cancelled", booking.bookingNumber),
    });
    if (session.status !== "open") {
      return NextResponse.json({ error: "This checkout is closed. Cancel this unpaid booking before trying again." }, { status: 409 });
    }
    createdCheckout = { bookingId: booking.id, sessionId: session.id };
    if (!session.url) throw new Error("Provider did not return a hosted checkout URL");

    const [saved] = await db.update(bookings).set({
      checkoutSessionId: session.id, checkoutExpiresAt: new Date(session.expires_at * 1000),
      checkoutStripeAccountId: operatorStripeId,
      operatorEarningsCents, paymentMode: "destination", updatedAt: new Date(),
    }).where(and(eq(bookings.id,booking.id), eq(bookings.status,"pending"), isNull(bookings.cancellationRequestedAt), sql`vakaygo_listing_bookable(${bookings.listingId})`)).returning({id:bookings.id});
    if (!saved) {
      await expireBookingCheckout(booking.id, session.id);
      createdCheckout = undefined;
      return NextResponse.json({ error: "This booking is no longer payable" }, { status: 409 });
    }
    createdCheckout = undefined;
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (createdCheckout) {
      try { await expireBookingCheckout(createdCheckout.bookingId, createdCheckout.sessionId); }
      catch (expiryError) { logger.error("Unavailable checkout expiry needs retry", { ...createdCheckout, error: expiryError }); }
    }
    const dbError = error as { cause?: { message?: string }; message?: string };
    if (/VG_BOOKING:/.test(dbError.cause?.message || dbError.message || "")) {
      return NextResponse.json({ error: "This business is not accepting bookings on VakayGo yet.", code: "BOOKING_UNAVAILABLE" }, { status: 409 });
    }
    logger.error("Checkout error", error);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
