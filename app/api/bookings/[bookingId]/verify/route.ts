import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

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
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        listingTitle: listings.title,
        listingType: listings.type,
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

    return NextResponse.json({
      valid: true,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      listingTitle: booking.listingTitle,
      listingType: booking.listingType,
      startDate: booking.startDate,
      endDate: booking.endDate,
      guestCount: booking.guestCount,
    });
  } catch (error) {
    console.error("Verify booking error:", error);
    return NextResponse.json(
      { error: "Failed to verify booking" },
      { status: 500 }
    );
  }
}
