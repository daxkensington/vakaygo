import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, users, listings } from "@/drizzle/schema";
import { gt, sql, eq, desc } from "drizzle-orm";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Cron: Generate weekly platform report.
 * Aggregates new bookings, revenue, new users, and top listings.
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

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // New bookings count and total revenue this week
    const [bookingStats] = await db
      .select({
        bookingCount: sql<number>`count(*)`,
        totalRevenue: sql<string>`COALESCE(SUM(${bookings.totalAmount}::numeric), 0)`,
      })
      .from(bookings)
      .where(gt(bookings.createdAt, oneWeekAgo));

    // New users this week
    const [userStats] = await db
      .select({
        newUsers: sql<number>`count(*)`,
      })
      .from(users)
      .where(gt(users.createdAt, oneWeekAgo));

    // Top 5 listings by booking count this week
    const topListings = await db
      .select({
        listingId: bookings.listingId,
        listingTitle: listings.title,
        bookingCount: sql<number>`count(*)`,
        revenue: sql<string>`COALESCE(SUM(${bookings.totalAmount}::numeric), 0)`,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(gt(bookings.createdAt, oneWeekAgo))
      .groupBy(bookings.listingId, listings.title)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const report = {
      period: {
        start: oneWeekAgo.toISOString(),
        end: new Date().toISOString(),
      },
      bookings: {
        count: Number(bookingStats?.bookingCount || 0),
        totalRevenue: parseFloat(bookingStats?.totalRevenue || "0").toFixed(2),
      },
      users: {
        newCount: Number(userStats?.newUsers || 0),
      },
      topListings: topListings.map((l) => ({
        listingId: l.listingId,
        title: l.listingTitle,
        bookings: Number(l.bookingCount),
        revenue: parseFloat(l.revenue).toFixed(2),
      })),
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error("Weekly report cron error:", error);
    return NextResponse.json(
      { error: "Failed to generate weekly report" },
      { status: 500 }
    );
  }
}
