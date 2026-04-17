import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, bookings, reviews, messages, users } from "@/drizzle/schema";
import { eq, sql, desc, and } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireOperator } from "@/server/admin-auth";
export async function GET() {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const userId = __auth.userId;

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Total revenue from completed bookings
    const [revenueResult] = await db
      .select({ total: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)` })
      .from(bookings)
      .where(and(eq(bookings.operatorId, userId), eq(bookings.status, "completed")));

    // Bookings this month
    const [monthBookings] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.operatorId, userId),
          sql`${bookings.createdAt} >= date_trunc('month', current_date)`
        )
      );

    // Total bookings
    const [totalBookingsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.operatorId, userId));

    // Average rating from reviews on operator's listings
    const [ratingResult] = await db
      .select({
        avg: sql<string>`coalesce(avg(${reviews.rating}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .innerJoin(listings, eq(reviews.listingId, listings.id))
      .where(eq(listings.operatorId, userId));

    // Active listings count
    const [activeListingsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(and(eq(listings.operatorId, userId), eq(listings.status, "active")));

    // Pending bookings count
    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.operatorId, userId), eq(bookings.status, "pending")));

    // Unread messages count
    const [unreadResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), eq(messages.isRead, false)));

    // Recent bookings (last 5)
    const recentBookings = await db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        status: bookings.status,
        totalAmount: bookings.totalAmount,
        createdAt: bookings.createdAt,
        listingTitle: listings.title,
        travelerName: users.name,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .innerJoin(users, eq(bookings.travelerId, users.id))
      .where(eq(bookings.operatorId, userId))
      .orderBy(desc(bookings.createdAt))
      .limit(5);

    // Monthly revenue for last 6 months
    const monthlyRevenue = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${bookings.createdAt}), 'YYYY-MM')`,
        revenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.operatorId, userId),
          eq(bookings.status, "completed"),
          sql`${bookings.createdAt} >= date_trunc('month', current_date) - interval '5 months'`
        )
      )
      .groupBy(sql`date_trunc('month', ${bookings.createdAt})`)
      .orderBy(sql`date_trunc('month', ${bookings.createdAt})`);

    return NextResponse.json({
      totalRevenue: parseFloat(revenueResult.total) || 0,
      bookingsThisMonth: monthBookings.count,
      totalBookings: totalBookingsResult.count,
      avgRating: parseFloat(parseFloat(ratingResult.avg).toFixed(1)) || 0,
      totalReviews: ratingResult.count,
      activeListings: activeListingsResult.count,
      pendingBookings: pendingResult.count,
      unreadMessages: unreadResult.count,
      recentBookings: recentBookings.map((b) => ({
        ...b,
        totalAmount: parseFloat(b.totalAmount),
      })),
      monthlyRevenue: monthlyRevenue.map((m) => ({
        month: m.month,
        revenue: parseFloat(m.revenue) || 0,
        count: m.count,
      })),
    });
  } catch (error) {
    logger.error("Operator stats error", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
