import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params;
    const db = getDb();

    // Look up by bookingNumber (from QR code) or by UUID
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        bookingId
      );

    const condition = isUuid
      ? eq(bookings.id, bookingId)
      : eq(bookings.bookingNumber, bookingId);

    const [booking] = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        totalAmount: bookings.totalAmount,
        currency: bookings.currency,
        verificationToken: bookings.verificationToken,
        checkedIn: bookings.checkedIn,
        checkedInAt: bookings.checkedInAt,
        travelerId: bookings.travelerId,
        listingTitle: listings.title,
        listingType: listings.type,
        listingAddress: listings.address,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(condition)
      .limit(1);

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found", valid: false },
        { status: 404 }
      );
    }

    // Get traveler info
    const [traveler] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.travelerId))
      .limit(1);

    return NextResponse.json({
      valid: true,
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      listingTitle: booking.listingTitle,
      listingType: booking.listingType,
      listingAddress: booking.listingAddress,
      startDate: booking.startDate,
      endDate: booking.endDate,
      guestCount: booking.guestCount,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      verificationToken: booking.verificationToken,
      checkedIn: booking.checkedIn,
      checkedInAt: booking.checkedInAt,
      guestName: traveler?.name || "Guest",
      guestEmail: traveler?.email,
    });
  } catch (error) {
    logger.error("Verify booking error", error);
    return NextResponse.json(
      { error: "Failed to verify booking" },
      { status: 500 }
    );
  }
}

// POST: Mark as checked in
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params;
    const { token } = await request.json();

    const db = getDb();

    const [booking] = await db
      .select({
        id: bookings.id,
        verificationToken: bookings.verificationToken,
        status: bookings.status,
        checkedIn: bookings.checkedIn,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Validate verification token
    if (!booking.verificationToken || booking.verificationToken !== token) {
      return NextResponse.json(
        { error: "Invalid verification token" },
        { status: 403 }
      );
    }

    // Check booking status
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: `Cannot check in a ${booking.status} booking` },
        { status: 400 }
      );
    }

    if (booking.checkedIn) {
      return NextResponse.json(
        { error: "Already checked in", checkedIn: true },
        { status: 400 }
      );
    }

    // Mark as checked in
    await db
      .update(bookings)
      .set({
        checkedIn: true,
        checkedInAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    return NextResponse.json({
      success: true,
      checkedIn: true,
      checkedInAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Check-in error", error);
    return NextResponse.json(
      { error: "Failed to check in" },
      { status: 500 }
    );
  }
}
