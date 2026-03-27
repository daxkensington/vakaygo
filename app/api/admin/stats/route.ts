import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, users, bookings, islands, waitlist } from "@/drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET() {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [listingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(listings).where(eq(listings.status, "active"));
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [bookingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings);
    const [waitlistCount] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlist);

    const listingsByType = await db
      .select({ type: listings.type, count: sql<number>`count(*)::int` })
      .from(listings).where(eq(listings.status, "active"))
      .groupBy(listings.type).orderBy(desc(sql`count(*)`));

    const listingsByIsland = await db
      .select({ name: islands.name, count: sql<number>`count(*)::int` })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(eq(listings.status, "active"))
      .groupBy(islands.name).orderBy(desc(sql`count(*)`))
      .limit(25);

    const recentBookings = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        totalAmount: bookings.totalAmount,
        createdAt: bookings.createdAt,
        listingTitle: listings.title,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .orderBy(desc(bookings.createdAt))
      .limit(10);

    return NextResponse.json({
      totals: {
        listings: listingCount.count,
        users: userCount.count,
        bookings: bookingCount.count,
        waitlist: waitlistCount.count,
      },
      listingsByType,
      listingsByIsland,
      recentBookings,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
