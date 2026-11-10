import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, users, bookings, islands, waitlist, operatorPayoutProfiles } from "@/drizzle/schema";
import { and, eq, isNull, sql, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";

export async function GET() {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [listingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(listings).where(eq(listings.status, "active"));
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [bookingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings);
    const [waitlistCount] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlist);
    // What is waiting on the team, so the dashboard's review buttons count the right thing.
    const [pendingListings] = await db.select({ count: sql<number>`count(*)::int` }).from(listings).where(eq(listings.status, "pending_review"));
    const [pendingPayoutProfiles] = await db.select({ count: sql<number>`count(*)::int` }).from(operatorPayoutProfiles)
      .where(and(eq(operatorPayoutProfiles.status, "pending_review"), isNull(operatorPayoutProfiles.revokedAt)));

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
      reviewQueue: { listings: pendingListings.count, payoutProfiles: pendingPayoutProfiles.count },
      listingsByType,
      listingsByIsland,
      recentBookings,
    });
  } catch (error) {
    logger.error("Admin stats error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
