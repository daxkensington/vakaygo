import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { randomUUID } from "crypto";

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
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Please sign in to view your voucher" },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const { bookingId } = await params;

    const db = getDb();

    // Fetch booking with listing and traveler details
    const [booking] = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        totalAmount: bookings.totalAmount,
        currency: bookings.currency,
        status: bookings.status,
        travelerId: bookings.travelerId,
        verificationToken: bookings.verificationToken,
        checkedIn: bookings.checkedIn,
        discountAmount: bookings.discountAmount,
        listingTitle: listings.title,
        listingType: listings.type,
        listingAddress: listings.address,
        operatorId: listings.operatorId,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Ensure the booking belongs to the authenticated user
    if (booking.travelerId !== userId) {
      return NextResponse.json(
        { error: "You do not have access to this voucher" },
        { status: 403 }
      );
    }

    // Generate verification token if not already set
    let verificationToken = booking.verificationToken;
    if (!verificationToken) {
      verificationToken = randomUUID();
      await db
        .update(bookings)
        .set({ verificationToken })
        .where(eq(bookings.id, bookingId));
    }

    // Get traveler name
    const [traveler] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, booking.travelerId))
      .limit(1);

    // Get operator info
    const [operator] = await db
      .select({
        name: users.name,
        businessName: users.businessName,
      })
      .from(users)
      .where(eq(users.id, booking.operatorId))
      .limit(1);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vakaygo.com";
    const verifyUrl = `${baseUrl}/verify/${booking.id}/${verificationToken}`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 400,
      margin: 2,
      color: { dark: "#1C2333", light: "#FFFFFF" },
      errorCorrectionLevel: "H",
    });

    return NextResponse.json({
      qrCodeDataUrl,
      verifyUrl,
      bookingNumber: booking.bookingNumber,
      listingTitle: booking.listingTitle,
      listingType: booking.listingType,
      listingAddress: booking.listingAddress,
      date: booking.startDate,
      endDate: booking.endDate,
      guestCount: booking.guestCount || 1,
      guestName: traveler?.name || "Guest",
      operatorName: operator?.businessName || operator?.name || "Local Operator",
      totalAmount: booking.totalAmount,
      discountAmount: booking.discountAmount,
      currency: booking.currency || "XCD",
      status: booking.status,
      checkedIn: booking.checkedIn,
    });
  } catch (error) {
    logger.error("Voucher error", error);
    return NextResponse.json(
      { error: "Failed to generate voucher" },
      { status: 500 }
    );
  }
}
