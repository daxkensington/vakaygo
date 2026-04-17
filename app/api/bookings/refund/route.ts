import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { refundBooking } from "@/server/stripe";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

/**
 * Calculate refund percentage based on cancellation policy and time until start.
 */
function calculateRefundPercent(
  policy: string | null,
  hoursUntilStart: number
): number {
  switch (policy) {
    case "flexible":
      return hoursUntilStart > 24 ? 100 : 0;

    case "moderate":
      if (hoursUntilStart > 5 * 24) return 100;
      if (hoursUntilStart > 24) return 50;
      return 0;

    case "strict":
      return hoursUntilStart > 7 * 24 ? 50 : 0;

    case "non_refundable":
      return 0;

    default:
      // Default to moderate if not set
      if (hoursUntilStart > 5 * 24) return 100;
      if (hoursUntilStart > 24) return 50;
      return 0;
  }
}

/**
 * POST — Traveler-initiated refund with cancellation policy enforcement.
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const { bookingId, reason } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Get booking
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.travelerId !== userId) {
      return NextResponse.json({ error: "Not your booking" }, { status: 403 });
    }

    if (booking.status !== "confirmed" && booking.status !== "completed") {
      return NextResponse.json(
        { error: "Booking cannot be refunded in its current status" },
        { status: 400 }
      );
    }

    if (!booking.paymentId) {
      return NextResponse.json(
        { error: "No payment found for this booking" },
        { status: 400 }
      );
    }

    // Get listing cancellation policy
    const [listing] = await db
      .select({ cancellationPolicy: listings.cancellationPolicy })
      .from(listings)
      .where(eq(listings.id, booking.listingId))
      .limit(1);

    const now = new Date();
    const startDate = new Date(booking.startDate);
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const refundPercent = calculateRefundPercent(
      listing?.cancellationPolicy || "moderate",
      hoursUntilStart
    );

    if (refundPercent === 0) {
      return NextResponse.json(
        {
          error: "This booking is not eligible for a refund under the current cancellation policy",
          policy: listing?.cancellationPolicy || "moderate",
          refundPercent: 0,
        },
        { status: 422 }
      );
    }

    const totalCents = Math.round(parseFloat(booking.totalAmount || "0") * 100);
    const refundAmountCents = Math.round(totalCents * (refundPercent / 100));

    // Process Stripe refund
    await refundBooking({
      paymentIntentId: booking.paymentId,
      amount: refundAmountCents,
    });

    // Update booking status
    const newStatus = refundPercent === 100 ? "refunded" : "cancelled";
    await db
      .update(bookings)
      .set({
        status: newStatus,
        cancellationReason: reason || `Refund requested (${refundPercent}% under ${listing?.cancellationPolicy || "moderate"} policy)`,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    return NextResponse.json({
      success: true,
      refundAmount: refundAmountCents / 100,
      refundPercent,
      policy: listing?.cancellationPolicy || "moderate",
      status: newStatus,
    });
  } catch (error) {
    logger.error("Refund error", error);
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}
