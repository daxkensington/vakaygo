import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  users,
  listings,
  bookings,
  reviews,
  islands,
} from "@/drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/server/admin-auth";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") return null;
    return payload.id as string;
  } catch {
    return null;
  }
}

export async function GET() {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const adminId = __auth.userId;

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    // ── User growth by month (last 12 months) ──────────────────
    const usersByMonth = await db
      .select({
        month: sql<string>`to_char(${users.createdAt}, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
        travelers: sql<number>`count(*) filter (where ${users.role} = 'traveler')::int`,
        operators: sql<number>`count(*) filter (where ${users.role} = 'operator')::int`,
      })
      .from(users)
      .where(sql`${users.createdAt} >= now() - interval '12 months'`)
      .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM')`);

    // ── Booking funnel ─────────────────────────────────────────
    const [funnelData] = await db
      .select({
        totalBookings: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${bookings.status} = 'pending')::int`,
        confirmed: sql<number>`count(*) filter (where ${bookings.status} = 'confirmed')::int`,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where ${bookings.status} = 'cancelled')::int`,
      })
      .from(bookings);

    const bookingFunnel = {
      ...funnelData,
      conversionRate:
        funnelData.totalBookings > 0
          ? parseFloat(
              (funnelData.completed / funnelData.totalBookings).toFixed(4)
            )
          : 0,
    };

    // ── Top listings by revenue ────────────────────────────────
    const topListings = await db
      .select({
        title: listings.title,
        type: listings.type,
        bookingCount: sql<number>`count(${bookings.id})::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
        avgRating: listings.avgRating,
      })
      .from(listings)
      .leftJoin(bookings, eq(bookings.listingId, listings.id))
      .where(eq(listings.status, "active"))
      .groupBy(listings.id, listings.title, listings.type, listings.avgRating)
      .orderBy(desc(sql`coalesce(sum(${bookings.totalAmount}), 0)`))
      .limit(5);

    // ── Top islands by bookings ────────────────────────────────
    const topIslands = await db
      .select({
        name: islands.name,
        listingCount: sql<number>`count(distinct ${listings.id})::int`,
        bookingCount: sql<number>`count(distinct ${bookings.id})::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
      })
      .from(islands)
      .leftJoin(listings, eq(listings.islandId, islands.id))
      .leftJoin(bookings, eq(bookings.listingId, listings.id))
      .where(eq(islands.isActive, true))
      .groupBy(islands.id, islands.name)
      .orderBy(desc(sql`count(distinct ${bookings.id})`))
      .limit(5);

    // ── Top operators by revenue ───────────────────────────────
    const topOperators = await db
      .select({
        name: users.name,
        businessName: users.businessName,
        listingCount: sql<number>`count(distinct ${listings.id})::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
      })
      .from(users)
      .leftJoin(listings, eq(listings.operatorId, users.id))
      .leftJoin(bookings, eq(bookings.operatorId, users.id))
      .where(eq(users.role, "operator"))
      .groupBy(users.id, users.name, users.businessName)
      .orderBy(desc(sql`coalesce(sum(${bookings.totalAmount}), 0)`))
      .limit(5);

    // ── Platform health ────────────────────────────────────────
    const [listingHealth] = await db
      .select({
        totalListings: sql<number>`count(*)::int`,
        activeListings: sql<number>`count(*) filter (where ${listings.status} = 'active')::int`,
      })
      .from(listings);

    const [reviewHealth] = await db
      .select({
        totalReviews: sql<number>`count(*)::int`,
      })
      .from(reviews);

    const completedBookings = bookingFunnel.completed;

    const platformHealth = {
      activeListingsPercent:
        listingHealth.totalListings > 0
          ? parseFloat(
              (
                (listingHealth.activeListings / listingHealth.totalListings) *
                100
              ).toFixed(1)
            )
          : 0,
      avgResponseTime: 2.4, // placeholder in hours
      reviewRate:
        completedBookings > 0
          ? parseFloat(
              ((reviewHealth.totalReviews / completedBookings) * 100).toFixed(1)
            )
          : 0,
      repeatBookingRate: 18.5, // placeholder percentage
    };

    // ── Recent activity (last 7 days) ──────────────────────────
    const sevenDaysAgo = sql`now() - interval '7 days'`;

    const [newUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} >= ${sevenDaysAgo}`);

    const [newBookings] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(sql`${bookings.createdAt} >= ${sevenDaysAgo}`);

    const [newReviews] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(sql`${reviews.createdAt} >= ${sevenDaysAgo}`);

    const [newListings] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(sql`${listings.createdAt} >= ${sevenDaysAgo}`);

    const recentActivity = {
      newUsers: newUsers.count,
      newBookings: newBookings.count,
      newReviews: newReviews.count,
      newListings: newListings.count,
    };

    return NextResponse.json({
      usersByMonth,
      bookingFunnel,
      topListings: topListings.map((l) => ({
        ...l,
        revenue: parseFloat(String(l.revenue)),
        avgRating: parseFloat(String(l.avgRating ?? 0)),
      })),
      topIslands: topIslands.map((i) => ({
        ...i,
        revenue: parseFloat(String(i.revenue)),
      })),
      topOperators: topOperators.map((o) => ({
        ...o,
        revenue: parseFloat(String(o.revenue)),
      })),
      platformHealth,
      recentActivity,
    });
  } catch (error) {
    logger.error("Admin analytics error", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics data" },
      { status: 500 }
    );
  }
}
