import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/** Constant-time string comparison that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params;
    const { searchParams } = new URL(request.url);
    const providedToken = searchParams.get("token") || "";
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

    // SECURITY: this endpoint is unauthenticated (operators scan a QR), so the
    // caller MUST prove possession of the booking's verification token. Without
    // this gate anyone could enumerate booking ids/numbers and harvest the
    // check-in token + guest PII. Never echo the token or guest email back.
    if (
      !booking ||
      !booking.verificationToken ||
      !providedToken ||
      !safeEqual(providedToken, booking.verificationToken)
    ) {
      return NextResponse.json(
        { error: "Booking not found", valid: false },
        { status: 404 }
      );
    }

    // Get traveler display name only (no email).
    const [traveler] = await db
      .select({ name: users.name })
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
      checkedIn: booking.checkedIn,
      checkedInAt: booking.checkedInAt,
      guestName: traveler?.name || "Guest",
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
