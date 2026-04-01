import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { calculateBookingPrice } from "@/lib/pricing";
import { sendBookingConfirmation, sendBookingNotificationToOperator } from "@/server/email";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

function generateBookingNumber(): string {
  const prefix = "VG";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export async function POST(request: Request) {
  try {
    // Verify auth
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Please sign in to book" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const travelerId = payload.id as string;

    const body = await request.json();
    const {
      listingId,
      startDate,
      endDate,
      guestCount = 1,
      guestNotes,
      includeInsurance = false,
      paymentMethod = "card",
    } = body;

    if (!listingId || !startDate) {
      return NextResponse.json({ error: "Listing and date are required" }, { status: 400 });
    }

    const db = getDb();

    // Get listing details
    const [listing] = await db
      .select({
        id: listings.id,
        operatorId: listings.operatorId,
        priceAmount: listings.priceAmount,
        priceCurrency: listings.priceCurrency,
        priceUnit: listings.priceUnit,
        type: listings.type,
        title: listings.title,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const pricePerUnit = parseFloat(listing.priceAmount || "0");

    // Calculate quantity based on type
    let quantity = guestCount;
    if (listing.type === "stay" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      quantity = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (listing.priceUnit === "trip" || listing.priceUnit === "group") {
      quantity = 1;
    }

    const pricing = calculateBookingPrice({
      pricePerUnit,
      quantity,
      listingType: listing.type,
      currency: listing.priceCurrency || "USD",
      includeInsurance,
    });

    // Create booking
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: generateBookingNumber(),
        travelerId,
        listingId: listing.id,
        operatorId: listing.operatorId,
        status: "pending",
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        guestCount,
        subtotal: pricing.subtotal.toFixed(2),
        serviceFee: pricing.serviceFee.toFixed(2),
        totalAmount: pricing.total.toFixed(2),
        currency: pricing.currency,
        paymentMethod,
        guestNotes,
      })
      .returning({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        totalAmount: bookings.totalAmount,
      });

    // Send confirmation emails (non-blocking)
    const [traveler] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, travelerId))
      .limit(1);

    const [operator] = await db
      .select({ email: users.email, name: users.name, businessName: users.businessName })
      .from(users)
      .where(eq(users.id, listing.operatorId))
      .limit(1);

    if (traveler?.email) {
      sendBookingConfirmation({
        to: traveler.email,
        travelerName: traveler.name || "Traveler",
        bookingNumber: booking.bookingNumber,
        listingTitle: listing.title,
        startDate,
        guestCount,
        totalAmount: pricing.total.toFixed(2),
      }).catch(() => {});
    }

    if (operator?.email && !operator.email.includes("unclaimed")) {
      sendBookingNotificationToOperator({
        to: operator.email,
        operatorName: operator.businessName || operator.name || "Operator",
        bookingNumber: booking.bookingNumber,
        listingTitle: listing.title,
        travelerName: traveler?.name || "A traveler",
        startDate,
        guestCount,
        subtotal: pricing.operatorEarnings.toFixed(2),
      }).catch(() => {});
    }

    return NextResponse.json({
      booking,
      pricing,
      listing: { title: listing.title, type: listing.type },
    });
  } catch (error) {
    console.error("Booking error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const role = payload.role as string;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "traveler";

    const db = getDb();

    const results = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        subtotal: bookings.subtotal,
        serviceFee: bookings.serviceFee,
        totalAmount: bookings.totalAmount,
        currency: bookings.currency,
        paymentMethod: bookings.paymentMethod,
        guestNotes: bookings.guestNotes,
        createdAt: bookings.createdAt,
        listingTitle: listings.title,
        listingType: listings.type,
        listingSlug: listings.slug,
        paidAt: bookings.paidAt,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(
        view === "operator" && role === "operator"
          ? eq(bookings.operatorId, userId)
          : eq(bookings.travelerId, userId)
      )
      .orderBy(bookings.createdAt);

    return NextResponse.json({ bookings: results });
  } catch (error) {
    console.error("Get bookings error:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
