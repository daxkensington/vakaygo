import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { refundBooking } from "@/server/stripe";
import { calculateRefundPercent } from "@/lib/cancellation";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const { bookingId, reason } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [booking] = await db
      .select({
        id: bookings.id,
        travelerId: bookings.travelerId,
        operatorId: bookings.operatorId,
        status: bookings.status,
        startDate: bookings.startDate,
        paymentId: bookings.paymentId,
        totalAmount: bookings.totalAmount,
        listingId: bookings.listingId,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.travelerId !== userId && booking.operatorId !== userId) {
      return NextResponse.json({ error: "Not your booking" }, { status: 403 });
    }

    if (booking.status === "cancelled" || booking.status === "refunded") {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }

    // Refund is governed by the listing's cancellation policy — the SAME
    // engine the /refund route uses, so the two endpoints never diverge.
    const now = new Date();
    const start = new Date(booking.startDate);
    const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

    const [listing] = await db
      .select({ cancellationPolicy: listings.cancellationPolicy })
      .from(listings)
      .where(eq(listings.id, booking.listingId))
      .limit(1);
    const policy = listing?.cancellationPolicy || "moderate";
    const refundPercent = calculateRefundPercent(policy, hoursUntilStart);

    // Actually issue the refund for a paid booking instead of only promising
    // one. Unpaid bookings (no paymentId) just transition to cancelled.
    let refundAmount = 0;
    let newStatus: "cancelled" | "refunded" = "cancelled";

    if (booking.paymentId && refundPercent > 0) {
      const totalCents = Math.round(parseFloat(booking.totalAmount || "0") * 100);
      const refundAmountCents = Math.round(totalCents * (refundPercent / 100));

      // refundBooking auto-detects the charge mode; the per-booking idempotency
      // key makes concurrent cancel/refund attempts collapse to one refund.
      await refundBooking({
        paymentIntentId: booking.paymentId,
        amount: refundAmountCents,
        fullRefund: refundPercent === 100,
        idempotencyKey: `refund_${booking.id}`,
      });

      refundAmount = refundAmountCents / 100;
      newStatus = refundPercent === 100 ? "refunded" : "cancelled";
    }

    await db
      .update(bookings)
      .set({
        status: newStatus,
        cancellationReason:
          reason || `Cancelled by user (${refundPercent}% refund under ${policy} policy)`,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    return NextResponse.json({
      success: true,
      refundPercent,
      refundAmount,
      policy,
      status: newStatus,
      message:
        refundPercent > 0
          ? `Booking cancelled. A ${refundPercent}% refund${
              booking.paymentId ? " has been issued" : " applies"
            }.`
          : "Booking cancelled. This booking is not eligible for a refund under the cancellation policy.",
    });
  } catch (error) {
    logger.error("Cancel booking error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
