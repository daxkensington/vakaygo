import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reviews, listings, users } from "@/drizzle/schema";
import { sendNewReviewNotification } from "@/server/email";
import { eq, and, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");

    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const result = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        operatorReply: reviews.operatorReply,
        createdAt: reviews.createdAt,
        travelerName: users.name,
        travelerAvatar: users.avatarUrl,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.travelerId, users.id))
      .where(and(eq(reviews.listingId, listingId), eq(reviews.isPublished, true)))
      .orderBy(reviews.createdAt);

    return NextResponse.json({ reviews: result });
  } catch (error) {
    console.error("Reviews error:", error);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const travelerId = payload.id as string;

    const { bookingId, listingId, rating, title, comment } = await request.json();

    if (!bookingId || !listingId || !rating) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [review] = await db
      .insert(reviews)
      .values({
        bookingId,
        listingId,
        travelerId,
        rating,
        title,
        comment,
      })
      .returning({ id: reviews.id });

    // Update listing avg rating
    const ratingResult = await db
      .select({
        avg: sql<string>`AVG(${reviews.rating})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(reviews)
      .where(and(eq(reviews.listingId, listingId), eq(reviews.isPublished, true)));

    if (ratingResult[0]) {
      await db
        .update(listings)
        .set({
          avgRating: parseFloat(ratingResult[0].avg).toFixed(2),
          reviewCount: ratingResult[0].count,
        })
        .where(eq(listings.id, listingId));
    }

    // Notify operator of new review (non-blocking)
    try {
      const [listing] = await db
        .select({ operatorId: listings.operatorId, title: listings.title })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);

      if (listing) {
        const [operator] = await db
          .select({ email: users.email, name: users.name, businessName: users.businessName })
          .from(users)
          .where(eq(users.id, listing.operatorId))
          .limit(1);

        const [traveler] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, travelerId))
          .limit(1);

        if (operator?.email && !operator.email.includes("unclaimed")) {
          sendNewReviewNotification({
            to: operator.email,
            operatorName: operator.businessName || operator.name || "Operator",
            listingTitle: listing.title,
            rating,
            travelerName: traveler?.name || "A traveler",
            comment: comment || "",
          }).catch(() => {});
        }
      }
    } catch (_emailErr) {
      // Email failure should not break the review response
    }

    return NextResponse.json({ review });
  } catch (error) {
    console.error("Create review error:", error);
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }
}
