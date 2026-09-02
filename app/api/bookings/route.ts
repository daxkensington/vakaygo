import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, users, islands, promoCodes, promoCodeUses } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { calculateBookingPrice } from "@/lib/pricing";
import { sendBookingReceived, sendBookingNotificationToOperator } from "@/server/email";
import { EXPIRE_AFTER_HOURS } from "@/lib/abandoned-bookings";
import { sendBookingRequestReceived, sendBookingRequestToTeam } from "@/server/email-requests";
import { createNotification } from "@/server/notifications";
import { shouldRequestBooking, isUnclaimedTypeData, isUnclaimedOperatorEmail } from "@/lib/booking-request";
import { toWallClockDate, formatBookingDateTime } from "@/lib/booking-time";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

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

    // Enforce booking rules
    if (listing.maxGuests && guestCount > listing.maxGuests) {
      return NextResponse.json(
        { error: `Maximum ${listing.maxGuests} guests allowed for this listing` },
        { status: 400 }
      );
    }

    if (listing.advanceNotice && listing.advanceNotice > 0) {
      const now = new Date();
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
    const isRequest = shouldRequestBooking({
      typeData: listing.typeData,
      operatorEmail: listing.operatorEmail,
      priceAmount: listing.priceAmount,
    });
    const unclaimed =
      isUnclaimedTypeData(listing.typeData) || isUnclaimedOperatorEmail(listing.operatorEmail);

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
      pricePerUnit,
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

    // Emails (non-blocking)
    const [traveler] = await db
      .select({ email: users.email, name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, travelerId))
      .limit(1);

    const whenText = end
      ? `${formatBookingDateTime(start)} → ${formatBookingDateTime(end)}`
      : formatBookingDateTime(start);

    if (isRequest) {
      const td = (listing.typeData || {}) as Record<string, unknown>;
      const phone = typeof td.phone === "string" && td.phone.trim() ? td.phone.trim() : null;
      const website = typeof td.website === "string" && td.website.trim() ? td.website.trim() : null;

      if (traveler?.email) {
        sendBookingRequestReceived({
          to: traveler.email,
          travelerName: traveler.name || "Traveler",
          bookingNumber: booking.bookingNumber,
          listingTitle: listing.title,
          whenText,
          guestCount,
        }).catch((err) => logger.error("Booking request email (traveler) failed", err));
      }

      sendBookingRequestToTeam({
        bookingNumber: booking.bookingNumber,
        listingTitle: listing.title,
        listingUrl: `https://vakaygo.com/${listing.islandSlug}/${listing.slug}`,
        islandName: listing.islandName,
        businessPhone: phone,
        businessWebsite: website,
        whenText,
        guestCount,
        guestNotes: typeof guestNotes === "string" ? guestNotes : null,
        travelerName: traveler?.name || "Traveler",
        travelerEmail: traveler?.email || "",
        travelerPhone: traveler?.phone || null,
        unclaimed,
      }).catch((err) => logger.error("Booking request email (team) failed", err));

      // A claimed-but-unpriced listing still has a real operator to tell.
      if (!unclaimed && listing.operatorEmail) {
        sendBookingNotificationToOperator({
          to: listing.operatorEmail,
          operatorName: listing.operatorBusinessName || listing.operatorName || "Operator",
          bookingNumber: booking.bookingNumber,
          listingTitle: listing.title,
          travelerName: traveler?.name || "A traveler",
          startDate,
          guestCount,
          subtotal: pricing.operatorEarnings.toFixed(2),
        }).catch(() => {});
        createNotification({
          userId: listing.operatorId,
          type: "booking",
          title: `New booking request from ${traveler?.name || "a traveler"}`,
          body: `${listing.title} — ${booking.bookingNumber}`,
          link: "/operator/bookings",
        }).catch(() => {});
      }
    } else {
      // Nothing is paid yet: the real "Booking Confirmed" email goes out
      // from the Stripe webhook. This one says pay within 48 h or it expires.
      if (traveler?.email) {
        sendBookingReceived({
          to: traveler.email,
          travelerName: traveler.name || "Traveler",
          bookingNumber: booking.bookingNumber,
          listingTitle: listing.title,
          startDate,
          guestCount,
          totalAmount: finalTotal.toFixed(2),
          expiresAfterHours: EXPIRE_AFTER_HOURS,
        }).catch((err) => logger.error("Booking received email failed", err));
      }

      if (listing.operatorEmail && !unclaimed) {
        sendBookingNotificationToOperator({
          to: listing.operatorEmail,
          operatorName: listing.operatorBusinessName || listing.operatorName || "Operator",
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
    }

    return NextResponse.json({
      booking,
      // Widgets branch on this: "request" means nothing is confirmed or
      // charged and VakayGo will follow up with the business.
      mode: isRequest ? "request" : "booking",
      pricing: { ...pricing, discountAmount, finalTotal },
      listing: { title: listing.title, type: listing.type },
    });
  } catch (error) {
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
