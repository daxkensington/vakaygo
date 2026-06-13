import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { createCheckoutSession } from "@/server/stripe";
import { CATEGORY_RATES } from "@/lib/pricing";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function POST(request: Request) {
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

    // Get listing and operator
    const [listing] = await db
      .select({ title: listings.title, operatorId: listings.operatorId, type: listings.type })
      .from(listings)
      .where(eq(listings.id, booking.listingId))
      .limit(1);

    const [operator] = await db
      .select({ stripeAccountId: users.digipayMerchantId, email: users.email })
      .from(users)
      .where(eq(users.id, booking.operatorId))
      .limit(1);

    // Operators with a connected Stripe account get a destination charge;
    // everyone else (most Caribbean islands aren't Connect-supported
    // countries) gets a platform charge — earnings are tracked on the
    // payouts ledger and settled out-of-band.
    const operatorStripeId = operator?.stripeAccountId || null;

    const totalCents = Math.round(parseFloat(booking.totalAmount || "0") * 100);
    // Platform keeps the traveler service fee plus the type-specific
    // operator commission — must match lib/pricing.ts or the operator's
    // displayed earnings diverge from what actually lands in their account.
    const rates = CATEGORY_RATES[listing?.type || "tour"] || CATEGORY_RATES.tour;
    const platformFeeCents = Math.round(
      (parseFloat(booking.serviceFee || "0") +
        parseFloat(booking.subtotal || "0") * rates.operatorFee) * 100
    );

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
      successUrl: `https://vakaygo.com/bookings?paid=${booking.bookingNumber}`,
      cancelUrl: `https://vakaygo.com/bookings?cancelled=${booking.bookingNumber}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error("Checkout error", error);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
