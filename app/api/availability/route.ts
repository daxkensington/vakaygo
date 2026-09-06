import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { availability, bookings } from "@/drizzle/schema";
import { eq, and, gte, lt, inArray, sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireOperator, assertListingOwnership } from "@/server/admin-auth";
import { getListingBookingEligibility } from "@/server/business-onboarding";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    const month = searchParams.get("month"); // YYYY-MM

    if (!listingId || !month) {
      return NextResponse.json(
        { error: "listingId and month (YYYY-MM) are required" },
        { status: 400 }
      );
    }

    const [year, mon] = month.split("-").map(Number);
    if (!year || !mon || mon < 1 || mon > 12) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM" },
        { status: 400 }
      );
    }

    const managing = searchParams.get("mode") === "manage";
    if (managing) {
      const auth = await requireOperator();
      if (!auth.ok) return auth.error;
      const owns = await assertListingOwnership(listingId, auth.userId, auth.role);
      if (!owns.ok) return owns.error;
    }
    const eligibility = managing ? null : await getListingBookingEligibility(listingId);
    if (!managing && !eligibility?.eligible) {
      return NextResponse.json({
        availability: [], bookings: {}, month, bookingEligible: false,
        error: "This business is not accepting bookings on VakayGo yet.",
      }, { status: 409 });
    }

    const startDate = new Date(Date.UTC(year, mon - 1, 1));
    const endDate = new Date(Date.UTC(year, mon, 1));

    const db = getDb();

    // Fetch availability records for the month
    const availabilityRows = await db
      .select({
        date: availability.date,
        spots: availability.spots,
        spotsRemaining: availability.spotsRemaining,
        priceOverride: availability.priceOverride,
        isBlocked: availability.isBlocked,
      })
      .from(availability)
      .where(
        and(
          eq(availability.listingId, listingId),
          gte(availability.date, startDate),
          lt(availability.date, endDate)
        )
      );

    // Fetch booking counts per date for the month (exclude cancelled)
    const bookingRows = await db
      .select({
        startDate: bookings.startDate,
        guestCount: bookings.guestCount,
        endDate: bookings.endDate,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.listingId, listingId),
          inArray(bookings.status, ["pending", "confirmed", "completed"]),
          sql`coalesce(${bookings.endDate}, ${bookings.startDate}) >= ${startDate}`,
          lt(bookings.startDate, endDate)
        )
      );

    // Aggregate bookings by date
    const bookingsByDate: Record<string, number> = {};
    for (const b of bookingRows) {
      const until = b.endDate || new Date(b.startDate.getTime() + 86400000);
      for (let day = new Date(Math.max(b.startDate.getTime(), startDate.getTime())); day < until && day < endDate; day = new Date(day.getTime()+86400000)) {
        const dateKey=day.toISOString().slice(0,10);
        bookingsByDate[dateKey]=(bookingsByDate[dateKey] || 0)+(b.guestCount || 1);
      }
    }

    // Format availability
    const availabilityMap = [];
    for (let day = startDate; day < endDate; day = new Date(day.getTime() + 86400000)) {
      const date = day.toISOString().slice(0, 10);
      const rows = availabilityRows.filter(row => row.date.toISOString().slice(0, 10) === date);
      const isBlocked = rows.length === 0 || rows.some(row => row.isBlocked || !row.spots || row.spots <= 0);
      const spots = isBlocked ? 0 : Math.min(...rows.map(row => row.spots!));
      availabilityMap.push({ date, spots, spotsRemaining: Math.max(0, spots - (bookingsByDate[date] || 0)),
        priceOverride: rows[0]?.priceOverride ?? null, isBlocked });
    }

    return NextResponse.json({
      availability: managing ? availabilityRows.map(row => ({ ...row, date: row.date.toISOString().slice(0, 10) })) : availabilityMap,
      bookings: bookingsByDate,
      month,
      bookingEligible: eligibility?.eligible === true,
    });
  } catch (error) {
    logger.error("Availability GET error", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireOperator();
    if (!auth.ok) return auth.error;

    const body = await request.json();
    const { listingId, dates } = body as {
      listingId: string;
      dates: Array<{
        date: string;
        spots?: number | null;
        priceOverride?: string | null;
        isBlocked?: boolean;
      }>;
    };

    if (!listingId || !dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        { error: "listingId and dates array are required" },
        { status: 400 }
      );
    }

    // Bound the batch — at most a year of dates per request — so a single call
    // can't queue an unbounded number of per-date DB round trips.
    if (dates.length > 366) {
      return NextResponse.json(
        { error: "Too many dates in one request (max 366)" },
        { status: 400 }
      );
    }

    for (const entry of dates) {
      const parsed = typeof entry?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
        ? new Date(entry.date + "T00:00:00.000Z") : null;
      if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== entry.date) {
        return NextResponse.json({ error: "Every calendar entry needs a valid date" }, { status: 400 });
      }
      if (!entry.isBlocked && (!Number.isInteger(entry.spots) || Number(entry.spots) < 1 || Number(entry.spots) > 2147483647)) {
        return NextResponse.json({ error: "Published dates need a positive whole-number capacity" }, { status: 400 });
      }
      if (entry.priceOverride != null && (!/^\d+(\.\d{1,2})?$/.test(entry.priceOverride) || Number(entry.priceOverride) <= 0)) {
        return NextResponse.json({ error: "Price overrides must be positive amounts with at most two decimal places" }, { status: 400 });
      }
    }

    const owns = await assertListingOwnership(listingId, auth.userId, auth.role);
    if (!owns.ok) return owns.error;

    const db = getDb();

    // Upsert each date
    const results = [];
    for (const entry of dates) {
      const dateObj = new Date(entry.date + "T00:00:00.000Z");

      // Check if record exists
      const [existing] = await db
        .select({ id: availability.id })
        .from(availability)
        .where(
          and(
            eq(availability.listingId, listingId),
            eq(availability.date, dateObj)
          )
        )
        .limit(1);

      if (existing) {
        // Update
        const [updated] = await db
          .update(availability)
          .set({
            spots: entry.spots ?? null,
            spotsRemaining: entry.spots ?? null,
            priceOverride: entry.priceOverride ?? null,
            isBlocked: entry.isBlocked ?? false,
          })
          .where(eq(availability.id, existing.id))
          .returning({
            id: availability.id,
            date: availability.date,
            spots: availability.spots,
            spotsRemaining: availability.spotsRemaining,
            priceOverride: availability.priceOverride,
            isBlocked: availability.isBlocked,
          });
        results.push(updated);
      } else {
        // Insert
        const [inserted] = await db
          .insert(availability)
          .values({
            listingId,
            date: dateObj,
            spots: entry.spots ?? null,
            spotsRemaining: entry.spots ?? null,
            priceOverride: entry.priceOverride ?? null,
            isBlocked: entry.isBlocked ?? false,
          })
          .returning({
            id: availability.id,
            date: availability.date,
            spots: availability.spots,
            spotsRemaining: availability.spotsRemaining,
            priceOverride: availability.priceOverride,
            isBlocked: availability.isBlocked,
          });
        results.push(inserted);
      }
    }

    return NextResponse.json({ updated: results.length, results });
  } catch (error) {
    logger.error("Availability POST error", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}
