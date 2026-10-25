import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, bookings, reviews, messages, users } from "@/drizzle/schema";
import { eq, sql, desc, and } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireOperator } from "@/server/admin-auth";
import { getOnboardingStatus } from "@/server/business-onboarding";
import { completedSteps, describeNextStep, describeWaiting, nextOnboardingStep, ONBOARDING_CHECKLIST } from "@/lib/onboarding-nudges";

type OnboardingTask = {
  listingId: string;
  title: string;
  islandSlug: string;
  completed: number;
  total: number;
  next: { title: string; detail: string; actionLabel: string; href: string } | null;
  waiting: string | null;
};

/**
 * Claimed listings still short of activation, with the next step in the same
 * words as the reminder emails (lib/onboarding-nudges.ts). Travelers can see
 * these listings but cannot book them, which the rest of the dashboard hides.
 */
async function onboardingTasks(userId: string): Promise<OnboardingTask[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql.query(
    `SELECT l.id,l.title,l.status,i.slug island_slug
       FROM listing_onboarding n
       JOIN listings l ON l.id=n.listing_id AND l.operator_id=n.operator_id
       JOIN islands i ON i.id=l.island_id
      WHERE n.operator_id=$1::uuid AND (n.activated_at IS NULL OR n.suspended_at IS NOT NULL)
      ORDER BY n.created_at ASC LIMIT 10`,
    [userId]
  ) as { id: string; title: string; status: string; island_slug: string }[];
  const tasks: OnboardingTask[] = [];
  for (const row of rows) {
    try {
      const status = await getOnboardingStatus(row.id, userId);
      const directReady = status.payoutProfile?.status === "verified" && status.payoutProfile.w8benCertified === true && !status.payoutProfile.revoked;
      const requirements = { ...status.requirements, payments: status.requirements.payments || directReady };
      const step = nextOnboardingStep({
        requirements,
        listingStatus: row.status,
        payoutProfileStatus: status.payoutProfile?.status ?? null,
        payoutProfileRevoked: status.payoutProfile?.revoked === true,
        stripeConnected: status.stripe.connected,
        suspended: status.reason === "suspended",
      });
      if (step.kind === "done" || step.kind === "blocked") continue;
      tasks.push({
        listingId: row.id,
        title: row.title,
        islandSlug: row.island_slug,
        completed: completedSteps(requirements),
        total: ONBOARDING_CHECKLIST.length,
        next: describeNextStep(step, { listingId: row.id, stripeConnected: status.stripe.connected }),
        waiting: describeWaiting(step),
      });
    } catch (error) {
      logger.warn("Operator onboarding task unavailable", { listingId: row.id, error });
    }
  }
  return tasks;
}

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

    const onboarding = await onboardingTasks(userId);

    return NextResponse.json({
      onboarding,
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
