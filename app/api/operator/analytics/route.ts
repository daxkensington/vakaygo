import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { listings, listingViews, bookings } from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Get all operator listings
    const operatorListings = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        status: listings.status,
      })
      .from(listings)
      .where(eq(listings.operatorId, userId))
      .orderBy(desc(listings.createdAt));

    if (operatorListings.length === 0) {
      return NextResponse.json({
        listings: [],
        aggregate: {
          totalViews: 0,
          totalBookings: 0,
          conversionRate: 0,
          totalRevenue: 0,
          viewsByDay: [],
        },
      });
    }

    const listingIds = operatorListings.map((l) => l.id);

    // Per-listing stats
    const listingStats = await Promise.all(
      listingIds.map(async (listingId) => {
        // Total views
        const [totalViewsResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(listingViews)
          .where(eq(listingViews.listingId, listingId));

        // Views last 7 days
        const [views7d] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(listingViews)
          .where(
            and(
              eq(listingViews.listingId, listingId),
              sql`${listingViews.createdAt} >= now() - interval '7 days'`
            )
          );

        // Views last 30 days
        const [views30d] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(listingViews)
          .where(
            and(
              eq(listingViews.listingId, listingId),
              sql`${listingViews.createdAt} >= now() - interval '30 days'`
            )
          );

        // Booking count
        const [bookingCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(bookings)
          .where(eq(bookings.listingId, listingId));

        // Revenue from completed bookings
        const [revenueResult] = await db
          .select({
            total: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.listingId, listingId),
              eq(bookings.status, "completed")
            )
          );

        const totalViews = totalViewsResult.count || 0;
        const bookingsCount = bookingCount.count || 0;

        return {
          listingId,
          totalViews,
          views7d: views7d.count || 0,
          views30d: views30d.count || 0,
          bookings: bookingsCount,
          conversionRate:
            totalViews > 0
              ? parseFloat(((bookingsCount / totalViews) * 100).toFixed(2))
              : 0,
          revenue: parseFloat(revenueResult.total) || 0,
        };
      })
    );

    // Aggregate stats
    const totalViews = listingStats.reduce((s, l) => s + l.views30d, 0);
    const totalBookings = listingStats.reduce((s, l) => s + l.bookings, 0);
    const totalRevenue = listingStats.reduce((s, l) => s + l.revenue, 0);
    const allTimeViews = listingStats.reduce((s, l) => s + l.totalViews, 0);

    // Views by day (last 30 days) across all operator listings
    const viewsByDay = await db
      .select({
        date: sql<string>`to_char(${listingViews.createdAt}::date, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(listingViews)
      .where(
        and(
          sql`${listingViews.listingId} = ANY(${sql`ARRAY[${sql.join(
            listingIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )}]`})`,
          sql`${listingViews.createdAt} >= now() - interval '30 days'`
        )
      )
      .groupBy(sql`${listingViews.createdAt}::date`)
      .orderBy(sql`${listingViews.createdAt}::date`);

    // Merge listing metadata with stats
    const listingsWithStats = operatorListings.map((l) => {
      const stats = listingStats.find((s) => s.listingId === l.id);
      return {
        ...l,
        totalViews: stats?.totalViews || 0,
        views7d: stats?.views7d || 0,
        views30d: stats?.views30d || 0,
        bookings: stats?.bookings || 0,
        conversionRate: stats?.conversionRate || 0,
        revenue: stats?.revenue || 0,
      };
    });

    return NextResponse.json({
      listings: listingsWithStats,
      aggregate: {
        totalViews,
        totalBookings,
        conversionRate:
          allTimeViews > 0
            ? parseFloat(((totalBookings / allTimeViews) * 100).toFixed(2))
            : 0,
        totalRevenue,
        viewsByDay: viewsByDay.map((d) => ({
          date: d.date,
          views: d.count,
        })),
      },
    });
  } catch (error) {
    console.error("Operator analytics error:", error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
