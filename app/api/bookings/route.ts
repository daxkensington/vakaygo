import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users, islands, promoCodes, promoCodeUses, availability, pricingRules } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { calculateBookingPrice } from "@/lib/pricing";
import { shouldRequestBooking } from "@/lib/booking-request";
import { toWallClockDate } from "@/lib/booking-time";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { bookingInputError, isDemoListing, localBookingNow } from "@/lib/booking-validation";
import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

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
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid booking" }, { status: 400 });
    const inputError = bookingInputError(body);
    if (inputError) return NextResponse.json({ error: inputError }, { status: 400 });
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

    if (!listingId || !startDate || typeof startDate !== "string") {
      return NextResponse.json({ error: "Listing and date are required" }, { status: 400 });
    }

    // Widgets send wall-clock times ("2026-11-17T12:00:00") with no zone.
    // Pin them to UTC so the stored digits are the digits the traveler typed.
    const start = toWallClockDate(startDate);
    const end = endDate && typeof endDate === "string" ? toWallClockDate(endDate) : null;
    if (isNaN(start.getTime()) || (end && isNaN(end.getTime()))) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const db = getDb();

    // Get listing details (+ the operator + island in one round trip)
    const [listing] = await db
      .select({
        id: listings.id,
        status: listings.status,
        timezone: islands.timezone,
        slug: listings.slug,
        operatorId: listings.operatorId,
        priceAmount: listings.priceAmount,
        priceCurrency: listings.priceCurrency,
        priceUnit: listings.priceUnit,
        type: listings.type,
        title: listings.title,
        typeData: listings.typeData,
        minStay: listings.minStay,
        maxStay: listings.maxStay,
        advanceNotice: listings.advanceNotice,
        maxGuests: listings.maxGuests,
        islandName: islands.name,
        islandSlug: islands.slug,
        operatorEmail: users.email,
        operatorName: users.name,
        operatorBusinessName: users.businessName,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .innerJoin(users, eq(listings.operatorId, users.id))
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.status !== "active" || isDemoListing(listing.operatorId, listing.typeData)) {
      return NextResponse.json({ error: "This listing is not available for booking" }, { status: 409 });
    }
    const localNow = localBookingNow(listing.timezone);
    const dateOnly = startDate.length === 10;
    if ((dateOnly ? start.toISOString().slice(0, 10) < localNow.toISOString().slice(0, 10) : start <= localNow) || (end && end <= start) || (listing.type === "stay" && !end)) {
      return NextResponse.json({ error: "Choose future dates and a checkout after check-in" }, { status: 400 });
    }

    // Enforce booking rules
    if (listing.maxGuests && guestCount > listing.maxGuests) {
      return NextResponse.json(
        { error: `Maximum ${listing.maxGuests} guests allowed for this listing` },
        { status: 400 }
      );
    }

    if (listing.advanceNotice && listing.advanceNotice > 0) {
      const now = localNow;
      const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilStart < listing.advanceNotice) {
        return NextResponse.json(
          { error: `This listing requires at least ${listing.advanceNotice} hours advance notice` },
          { status: 400 }
        );
      }
    }

    if (listing.type === "stay" && end) {
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

    // Unclaimed (public-data) listings and unpriced listings cannot be
    // confirmed by anyone on the platform — they become REQUESTS that the
    // VakayGo team confirms with the business by phone. Nothing is charged.
    // Until date-based quotes are displayed, custom pricing requires a request.
    const [overrides, rules] = await Promise.all([
      db.select({ id: availability.id }).from(availability).where(and(eq(availability.listingId, listing.id), sql`${availability.priceOverride} is not null`)).limit(1),
      db.select({ id: pricingRules.id }).from(pricingRules).where(and(eq(pricingRules.listingId, listing.id), eq(pricingRules.isActive, true))).limit(1),
    ]);
    const isRequest = overrides.length > 0 || rules.length > 0 || shouldRequestBooking({
      typeData: listing.typeData,
      operatorEmail: listing.operatorEmail,
      priceAmount: listing.priceAmount,
    });

    const pricePerUnit = parseFloat(listing.priceAmount || "0");

    // Calculate quantity based on type
    let quantity = guestCount;
    if (listing.type === "stay" && end) {
      quantity = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (listing.priceUnit === "trip" || listing.priceUnit === "group") {
      quantity = 1;
    }

    const pricing = calculateBookingPrice({
      pricePerUnit: isRequest ? 0 : pricePerUnit,
      quantity,
      listingType: listing.type,
      currency: listing.priceCurrency || "USD",
      includeInsurance,
    });

    // Promo code validation and discount calculation
    let discountAmount = 0;
    let promoCodeId: string | null = null;

    if (promoCode && !isRequest) {
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
        status: isRequest ? "requested" : "pending",
        startDate: start,
        endDate: end,
        guestCount,
        subtotal: pricing.subtotal.toFixed(2),
        serviceFee: pricing.serviceFee.toFixed(2),
        totalAmount: finalTotal.toFixed(2),
        currency: pricing.currency,
        paymentMethod: isRequest ? "none" : paymentMethod,
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

    // Promo use and notifications are queued atomically by the insert trigger.

    return NextResponse.json({
      booking,
      // Widgets branch on this: "request" means nothing is confirmed or
      // charged and VakayGo will follow up with the business.
      mode: isRequest ? "request" : "booking",
      pricing: { ...pricing, discountAmount, finalTotal },
      listing: { title: listing.title, type: listing.type },
    });
  } catch (error) {
    const dbError = error as { cause?: { message?: string }; message?: string };
    const detail = dbError.cause?.message || dbError.message || "";
    if (/VG_BOOKING:/.test(detail)) return NextResponse.json({ error: detail.split("VG_BOOKING:")[1].trim() }, { status: 409 });
    logger.error("Booking error", error);
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
        islandSlug: islands.slug,
        paidAt: bookings.paidAt,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(
        view === "operator" && role === "operator"
          ? eq(bookings.operatorId, userId)
          : eq(bookings.travelerId, userId)
      )
      .orderBy(bookings.createdAt);

    return NextResponse.json({ bookings: results });
  } catch (error) {
    logger.error("Get bookings error", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
