import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { bookings, reviews } from "@/drizzle/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * POST — Analyze booking or review for fraud signals
 * Body: { type: "booking"|"review", data: { ... } }
 *
 * For bookings: data = { travelerId, listingId, totalAmount, guestCount, ip? }
 * For reviews:  data = { travelerId, listingId, rating }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await jwtVerify(token, SECRET);

    const { type, data } = await request.json();

    if (!type || !data) {
      return NextResponse.json(
        { error: "type and data required" },
        { status: 400 }
      );
    }

    if (!["booking", "review"].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "booking" or "review"' },
        { status: 400 }
      );
    }

    const db = getDb();
    let riskScore = 0;
    const flags: string[] = [];

    if (type === "booking") {
      const { travelerId, listingId, totalAmount, guestCount } = data;

      // Check 1: Multiple recent bookings by same user (velocity check)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentBookings = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.travelerId, travelerId),
            gt(bookings.createdAt, oneDayAgo)
          )
        );

      const recentCount = Number(recentBookings[0]?.count || 0);
      if (recentCount >= 5) {
        riskScore += 30;
        flags.push(`High booking velocity: ${recentCount} bookings in 24h`);
      } else if (recentCount >= 3) {
        riskScore += 15;
        flags.push(`Elevated booking velocity: ${recentCount} bookings in 24h`);
      }

      // Check 2: Suspicious amount (very high or very low)
      const amount = parseFloat(totalAmount || "0");
      if (amount > 10000) {
        riskScore += 25;
        flags.push(`Unusually high amount: $${amount}`);
      } else if (amount < 1 && amount > 0) {
        riskScore += 20;
        flags.push(`Suspiciously low amount: $${amount}`);
      }

      // Check 3: Large guest count
      if (guestCount && guestCount > 20) {
        riskScore += 15;
        flags.push(`Large guest count: ${guestCount}`);
      }

      // Check 4: Multiple bookings for same listing by same user
      const duplicateBookings = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.travelerId, travelerId),
            eq(bookings.listingId, listingId),
            eq(bookings.status, "pending")
          )
        );

      const dupCount = Number(duplicateBookings[0]?.count || 0);
      if (dupCount >= 2) {
        riskScore += 20;
        flags.push(
          `Duplicate pending bookings for same listing: ${dupCount}`
        );
      }
    }

    if (type === "review") {
      const { travelerId, listingId, rating } = data;

      // Check 1: Review velocity — multiple reviews in short time
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentReviews = await db
        .select({ count: sql<number>`count(*)` })
        .from(reviews)
        .where(
          and(
            eq(reviews.travelerId, travelerId),
            gt(reviews.createdAt, oneHourAgo)
          )
        );

      const reviewCount = Number(recentReviews[0]?.count || 0);
      if (reviewCount >= 5) {
        riskScore += 40;
        flags.push(`High review velocity: ${reviewCount} reviews in 1h`);
      } else if (reviewCount >= 3) {
        riskScore += 20;
        flags.push(`Elevated review velocity: ${reviewCount} reviews in 1h`);
      }

      // Check 2: Always giving extreme ratings (all 5s or all 1s)
      const userReviews = await db
        .select({
          avgRating: sql<string>`AVG(${reviews.rating})`,
          count: sql<number>`count(*)`,
        })
        .from(reviews)
        .where(eq(reviews.travelerId, travelerId));

      const avgRating = parseFloat(userReviews[0]?.avgRating || "3");
      const totalReviews = Number(userReviews[0]?.count || 0);

      if (totalReviews >= 5 && (avgRating >= 4.9 || avgRating <= 1.1)) {
        riskScore += 20;
        flags.push(
          `Suspicious rating pattern: avg ${avgRating.toFixed(1)} across ${totalReviews} reviews`
        );
      }

      // Check 3: Rating extreme outlier for this listing
      if (rating === 1 || rating === 5) {
        const listingAvg = await db
          .select({ avg: sql<string>`AVG(${reviews.rating})` })
          .from(reviews)
          .where(eq(reviews.listingId, listingId));

        const listAvg = parseFloat(listingAvg[0]?.avg || "3");
        if (
          (rating === 1 && listAvg >= 4.0) ||
          (rating === 5 && listAvg <= 2.0)
        ) {
          riskScore += 15;
          flags.push(
            `Rating ${rating} is extreme outlier (listing avg: ${listAvg.toFixed(1)})`
          );
        }
      }
    }

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    return NextResponse.json({ riskScore, flags });
  } catch (error) {
    console.error("Fraud detection error:", error);
    return NextResponse.json(
      { error: "Failed to analyze for fraud" },
      { status: 500 }
    );
  }
}
