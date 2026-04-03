import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users, promoCodes, promoCodeUses } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { calculateBookingPrice } from "@/lib/pricing";
import { sendBookingConfirmation, sendBookingNotificationToOperator } from "@/server/email";
import { createNotification } from "@/server/notifications";
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
      promoCode,
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
        minStay: listings.minStay,
        maxStay: listings.maxStay,
        advanceNotice: listings.advanceNotice,
        maxGuests: listings.maxGuests,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Enforce booking rules
    if (listing.maxGuests && guestCount > listing.maxGuests) {
      return NextResponse.json(
        { error: `Maximum ${listing.maxGuests} guests allowed for this listing` },
        { status: 400 }
      );
    }

    if (listing.advanceNotice && listing.advanceNotice > 0) {
      const bookingStart = new Date(startDate);
      const now = new Date();
      const hoursUntilStart = (bookingStart.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilStart < listing.advanceNotice) {
        return NextResponse.json(
          { error: `This listing requires at least ${listing.advanceNotice} hours advance notice` },
          { status: 400 }
        );
      }
    }

    if (listing.type === "stay" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (listing.minStay && nights < listing.minStay) {
        return NextResponse.json(
          { error: `Minimum stay is ${listing.minStay} night${listing.minStay > 1 ? "s" : ""}` },
          { status: 400 }
        );
      }

      if (listing.maxStay && nights > listing.maxStay) {
        return NextResponse.json(
          { error: `Maximum stay is ${listing.maxStay} night${listing.maxStay > 1 ? "s" : ""}` },
          { status: 400 }
        );
      }
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

    // Promo code validation and discount calculation
    let discountAmount = 0;
    let promoCodeId: string | null = null;

    if (promoCode) {
      const [promo] = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.code, promoCode.toUpperCase().trim()))
        .limit(1);

      if (promo && promo.isActive) {
        const now = new Date();
        const withinDates = now >= promo.validFrom && now <= promo.validUntil;
        const notExhausted = promo.maxUses === null || (promo.currentUses || 0) < promo.maxUses;

        // Check per-user limit
        let userCanUse = true;
        if (promo.maxUsesPerUser) {
          const [userUsage] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(promoCodeUses)
            .where(
              and(
                eq(promoCodeUses.promoCodeId, promo.id),
                eq(promoCodeUses.userId, travelerId)
              )
            );
          if (userUsage && userUsage.count >= promo.maxUsesPerUser) {
            userCanUse = false;
          }
        }

        // Check applicable types
        let typeMatches = true;
        if (promo.applicableTypes && promo.applicableTypes.length > 0) {
          typeMatches = promo.applicableTypes.includes(listing.type);
        }

        // Check min order
        let meetsMinimum = true;
        if (promo.minOrderAmount) {
          meetsMinimum = pricing.total >= parseFloat(promo.minOrderAmount);
        }

        if (withinDates && notExhausted && userCanUse && typeMatches && meetsMinimum) {
          promoCodeId = promo.id;

          if (promo.discountType === "percentage") {
            discountAmount = Math.round(pricing.total * parseFloat(promo.discountValue) / 100 * 100) / 100;
          } else {
            discountAmount = parseFloat(promo.discountValue);
          }

          // Cap at max discount if set
          if (promo.maxDiscountAmount) {
            discountAmount = Math.min(discountAmount, parseFloat(promo.maxDiscountAmount));
          }

          // Never discount more than the total
          discountAmount = Math.min(discountAmount, pricing.total);
        }
      }
    }

    const finalTotal = Math.max(0, pricing.total - discountAmount);

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
        totalAmount: finalTotal.toFixed(2),
        currency: pricing.currency,
        paymentMethod,
        guestNotes,
        promoCodeId,
        discountAmount: discountAmount.toFixed(2),
      })
      .returning({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        totalAmount: bookings.totalAmount,
      });

    // Record promo code use and increment counter
    if (promoCodeId) {
      await db.insert(promoCodeUses).values({
        promoCodeId,
        userId: travelerId,
        bookingId: booking.id,
        discountApplied: discountAmount.toFixed(2),
      });
      await db
        .update(promoCodes)
        .set({ currentUses: sql`${promoCodes.currentUses} + 1` })
        .where(eq(promoCodes.id, promoCodeId));
    }

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

    // In-app notification to operator about new booking
    createNotification({
      userId: listing.operatorId,
      type: "booking",
      title: `New booking from ${traveler?.name || "a traveler"}`,
      body: `${listing.title} — ${booking.bookingNumber}`,
      link: "/operator/bookings",
    }).catch(() => {});

    return NextResponse.json({
      booking,
      pricing: { ...pricing, discountAmount, finalTotal },
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
