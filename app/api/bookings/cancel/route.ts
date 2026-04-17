import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

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

    // Check if within free cancellation window (24h before start)
    const now = new Date();
    const start = new Date(booking.startDate);
    const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
    const freeCancel = hoursUntilStart > 24;

    await db
      .update(bookings)
      .set({
        status: freeCancel ? "cancelled" : "cancelled",
        cancellationReason: reason || (freeCancel ? "Cancelled by user (free cancellation)" : "Late cancellation"),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    return NextResponse.json({
      success: true,
      freeCancel,
      message: freeCancel
        ? "Booking cancelled. Full refund will be processed."
        : "Booking cancelled. A 50% cancellation fee may apply.",
    });
  } catch (error) {
    logger.error("Cancel booking error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
