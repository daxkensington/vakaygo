import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users, listings } from "@/drizzle/schema";
import { eq, and, isNull, lt, sql } from "drizzle-orm";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Cron: Find abandoned bookings (pending, unpaid, older than 2 hours).
 * Returns list for recovery email processing.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const abandoned = await db
      .select({
        bookingId: bookings.id,
        bookingNumber: bookings.bookingNumber,
        travelerId: bookings.travelerId,
        listingId: bookings.listingId,
        totalAmount: bookings.totalAmount,
        currency: bookings.currency,
        createdAt: bookings.createdAt,
        travelerName: users.name,
        travelerEmail: users.email,
        listingTitle: listings.title,
      })
      .from(bookings)
      .innerJoin(users, eq(bookings.travelerId, users.id))
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(
        and(
          eq(bookings.status, "pending"),
          isNull(bookings.paidAt),
          lt(bookings.createdAt, twoHoursAgo)
        )
      )
      .limit(200);

    return NextResponse.json({
      ok: true,
      abandonedCount: abandoned.length,
      bookings: abandoned,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Abandoned bookings cron error:", error);
    return NextResponse.json(
      { error: "Failed to process abandoned bookings" },
      { status: 500 }
    );
  }
}
