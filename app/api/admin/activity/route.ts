import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, bookings, reviews, listings } from "@/drizzle/schema";
import { desc, sql, eq } from "drizzle-orm";

type ActivityEvent = {
  type: "signup" | "booking" | "review" | "listing_approved";
  description: string;
  createdAt: string;
};

export async function GET() {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Fetch recent signups
    const recentSignups = await db
      .select({
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(10);

    // Fetch recent bookings
    const recentBookings = await db
      .select({
        bookingNumber: bookings.bookingNumber,
        totalAmount: bookings.totalAmount,
        listingTitle: listings.title,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .leftJoin(listings, eq(bookings.listingId, listings.id))
      .orderBy(desc(bookings.createdAt))
      .limit(10);

    // Fetch recent reviews
    const recentReviews = await db
      .select({
        rating: reviews.rating,
        listingTitle: listings.title,
        reviewerName: users.name,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .leftJoin(listings, eq(reviews.listingId, listings.id))
      .leftJoin(users, eq(reviews.travelerId, users.id))
      .orderBy(desc(reviews.createdAt))
      .limit(10);

    // Fetch recently approved listings
    const approvedListings = await db
      .select({
        title: listings.title,
        operatorName: users.name,
        updatedAt: listings.updatedAt,
      })
      .from(listings)
      .leftJoin(users, eq(listings.operatorId, users.id))
      .where(eq(listings.status, "active"))
      .orderBy(desc(listings.updatedAt))
      .limit(10);

    // Combine and sort
    const events: ActivityEvent[] = [];

    for (const s of recentSignups) {
      events.push({
        type: "signup",
        description: `${s.name || s.email} signed up`,
        createdAt: s.createdAt.toISOString(),
      });
    }

    for (const b of recentBookings) {
      events.push({
        type: "booking",
        description: `New booking #${b.bookingNumber} for ${b.listingTitle || "a listing"} ($${parseFloat(b.totalAmount).toFixed(2)})`,
        createdAt: b.createdAt.toISOString(),
      });
    }

    for (const r of recentReviews) {
      events.push({
        type: "review",
        description: `${r.reviewerName || "A traveler"} left a ${r.rating}-star review on ${r.listingTitle || "a listing"}`,
        createdAt: r.createdAt.toISOString(),
      });
    }

    for (const l of approvedListings) {
      events.push({
        type: "listing_approved",
        description: `"${l.title}" by ${l.operatorName || "an operator"} is now active`,
        createdAt: l.updatedAt.toISOString(),
      });
    }

    // Sort by date descending, take first 10
    events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Today's counts for quick stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} >= ${todayStart.toISOString()}`);

    const [todayBookings] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(sql`${bookings.createdAt} >= ${todayStart.toISOString()}`);

    const [todayListings] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(sql`${listings.createdAt} >= ${todayStart.toISOString()}`);

    const [todayReviews] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(sql`${reviews.createdAt} >= ${todayStart.toISOString()}`);

    return NextResponse.json({
      events: events.slice(0, 10),
      today: {
        users: todayUsers.count,
        bookings: todayBookings.count,
        listings: todayListings.count,
        reviews: todayReviews.count,
      },
    });
  } catch (err) {
    console.error("Activity feed error:", err);
    return NextResponse.json({ events: [], today: { users: 0, bookings: 0, listings: 0, reviews: 0 } });
  }
}
