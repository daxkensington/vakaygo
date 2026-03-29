import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { availability, bookings, listings } from "@/drizzle/schema";
import { eq, and, gte, lt, ne, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

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

    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

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
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.listingId, listingId),
          ne(bookings.status, "cancelled"),
          gte(bookings.startDate, startDate),
          lt(bookings.startDate, endDate)
        )
      );

    // Aggregate bookings by date
    const bookingsByDate: Record<string, number> = {};
    for (const b of bookingRows) {
      const dateKey = b.startDate.toISOString().split("T")[0];
      bookingsByDate[dateKey] = (bookingsByDate[dateKey] || 0) + (b.guestCount || 1);
    }

    // Format availability
    const availabilityMap = availabilityRows.map((row) => ({
      date: row.date.toISOString().split("T")[0],
      spots: row.spots,
      spotsRemaining: row.spotsRemaining,
      priceOverride: row.priceOverride,
      isBlocked: row.isBlocked,
    }));

    return NextResponse.json({
      availability: availabilityMap,
      bookings: bookingsByDate,
      month,
    });
  } catch (error) {
    console.error("Availability GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Verify auth - operator only
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Please sign in" },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const role = payload.role as string;

    if (role !== "operator" && role !== "admin") {
      return NextResponse.json(
        { error: "Only operators can manage availability" },
        { status: 403 }
      );
    }

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

    const db = getDb();

    // Verify the operator owns this listing
    const [listing] = await db
      .select({ id: listings.id, operatorId: listings.operatorId })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    if (listing.operatorId !== userId && role !== "admin") {
      return NextResponse.json(
        { error: "You do not own this listing" },
        { status: 403 }
      );
    }

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
    console.error("Availability POST error:", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}
