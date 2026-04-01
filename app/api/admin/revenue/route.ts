import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, listings, islands } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Total revenue from completed bookings
    const [revenueResult] = await db
      .select({
        totalRevenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
        platformFees: sql<string>`coalesce(sum(${bookings.serviceFee}), 0)`,
        avgBookingValue: sql<string>`coalesce(avg(${bookings.totalAmount}), 0)`,
        completedCount: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(eq(bookings.status, "completed"));

    // Revenue by month (last 12 months)
    const byMonth = await db
      .select({
        month: sql<string>`to_char(${bookings.createdAt}, 'YYYY-MM')`,
        revenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
        fees: sql<string>`coalesce(sum(${bookings.serviceFee}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        sql`${bookings.status} = 'completed' AND ${bookings.createdAt} >= now() - interval '12 months'`
      )
      .groupBy(sql`to_char(${bookings.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${bookings.createdAt}, 'YYYY-MM')`);

    // Revenue by island
    const byIsland = await db
      .select({
        islandName: islands.name,
        islandSlug: islands.slug,
        revenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
        fees: sql<string>`coalesce(sum(${bookings.serviceFee}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(eq(bookings.status, "completed"))
      .groupBy(islands.name, islands.slug)
      .orderBy(sql`sum(${bookings.totalAmount}) desc`);

    // Revenue by listing type
    const byType = await db
      .select({
        type: listings.type,
        revenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
        fees: sql<string>`coalesce(sum(${bookings.serviceFee}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(eq(bookings.status, "completed"))
      .groupBy(listings.type)
      .orderBy(sql`sum(${bookings.totalAmount}) desc`);

    return NextResponse.json({
      totalRevenue: parseFloat(revenueResult.totalRevenue),
      platformFees: parseFloat(revenueResult.platformFees),
      avgBookingValue: parseFloat(parseFloat(revenueResult.avgBookingValue).toFixed(2)),
      completedBookings: revenueResult.completedCount,
      byMonth: byMonth.map((m) => ({
        ...m,
        revenue: parseFloat(m.revenue),
        fees: parseFloat(m.fees),
      })),
      byIsland: byIsland.map((i) => ({
        ...i,
        revenue: parseFloat(i.revenue),
        fees: parseFloat(i.fees),
      })),
      byType: byType.map((t) => ({
        ...t,
        revenue: parseFloat(t.revenue),
        fees: parseFloat(t.fees),
      })),
    });
  } catch (error) {
    console.error("Admin revenue error:", error);
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
}
