import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, bookings, availability } from "@/drizzle/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { generateICal } from "@/lib/ical-parser";
import { randomUUID } from "crypto";

import { logger } from "@/lib/logger";
import { requireOperator } from "@/server/admin-auth";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — iCal export feed.
 * Public access via ?token= parameter (unique per listing).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 401 }
      );
    }

    const db = getDb();

    // Verify token matches the listing
    const [listing] = await db
      .select({
        id: listings.id,
        title: listings.title,
        icalToken: listings.icalToken,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing || listing.icalToken !== token) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 403 }
      );
    }

    const now = new Date();

    // Fetch confirmed/completed bookings (future and recent)
    const bookingRows = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        guestCount: bookings.guestCount,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.listingId, listingId),
          inArray(bookings.status, ["confirmed", "completed"]),
          gte(bookings.startDate, new Date(now.getFullYear() - 1, 0, 1))
        )
      );

    // Fetch blocked dates (future only)
    const blockedRows = await db
      .select({
        id: availability.id,
        date: availability.date,
        isBlocked: availability.isBlocked,
      })
      .from(availability)
      .where(
        and(
          eq(availability.listingId, listingId),
          eq(availability.isBlocked, true),
          gte(availability.date, now)
        )
      );

    // Build iCal events
    const events: Array<{
      uid: string;
      start: Date;
      end: Date;
      summary: string;
      description?: string;
    }> = [];

    // Bookings
    for (const b of bookingRows) {
      const endDate = b.endDate || new Date(b.startDate.getTime() + 86400000);
      events.push({
        uid: `booking-${b.id}@vakaygo.com`,
        start: b.startDate,
        end: endDate,
        summary: `Booking ${b.bookingNumber}`,
        description: `Booking #${b.bookingNumber} - ${b.guestCount || 1} guest(s) - Status: ${b.status}`,
      });
    }

    // Blocked dates
    for (const bl of blockedRows) {
      const nextDay = new Date(bl.date.getTime() + 86400000);
      events.push({
        uid: `blocked-${bl.id}@vakaygo.com`,
        start: bl.date,
        end: nextDay,
        summary: "Blocked",
        description: "Date blocked on VakayGo",
      });
    }

    const icalContent = generateICal(events);

    return new Response(icalContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${listing.title.replace(/[^a-zA-Z0-9]/g, "_")}_calendar.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    logger.error("iCal export error", error);
    return NextResponse.json(
      { error: "Failed to generate iCal feed" },
      { status: 500 }
    );
  }
}

/**
 * POST — Generate or retrieve the iCal token for a listing.
 * Requires operator auth.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params;

    const auth = await requireOperator();
    if (!auth.ok) return auth.error;
    const userId = auth.userId;
    const role = auth.role;

    const db = getDb();

    // Verify ownership
    const [listing] = await db
      .select({
        id: listings.id,
        operatorId: listings.operatorId,
        icalToken: listings.icalToken,
        icalImportUrl: listings.icalImportUrl,
        icalLastSync: listings.icalLastSync,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.operatorId !== userId && role !== "admin") {
      return NextResponse.json(
        { error: "You do not own this listing" },
        { status: 403 }
      );
    }

    // Generate token if not yet set
    let token = listing.icalToken;
    if (!token) {
      token = randomUUID();
      await db
        .update(listings)
        .set({ icalToken: token })
        .where(eq(listings.id, listingId));
    }

    return NextResponse.json({
      icalToken: token,
      icalImportUrl: listing.icalImportUrl,
      icalLastSync: listing.icalLastSync,
    });
  } catch (error) {
    logger.error("iCal token error", error);
    return NextResponse.json(
      { error: "Failed to get iCal settings" },
      { status: 500 }
    );
  }
}
