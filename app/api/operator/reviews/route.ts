import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reviews, listings, users } from "@/drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { requireOperator } from "@/server/admin-auth";
export async function GET() {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const userId = __auth.userId;

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Fetch all reviews on this operator's listings
    const allReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        operatorReply: reviews.operatorReply,
        operatorRepliedAt: reviews.operatorRepliedAt,
        createdAt: reviews.createdAt,
        listingTitle: listings.title,
        travelerName: users.name,
      })
      .from(reviews)
      .innerJoin(listings, eq(reviews.listingId, listings.id))
      .innerJoin(users, eq(reviews.travelerId, users.id))
      .where(eq(listings.operatorId, userId))
      .orderBy(desc(reviews.createdAt));

    // Compute stats
    const totalReviews = allReviews.length;
    const avgRating =
      totalReviews > 0
        ? parseFloat(
            (
              allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
            ).toFixed(1)
          )
        : 0;
    const repliedCount = allReviews.filter((r) => r.operatorReply).length;
    const responseRate =
      totalReviews > 0
        ? parseFloat(((repliedCount / totalReviews) * 100).toFixed(0))
        : 0;

    return NextResponse.json({
      reviews: allReviews,
      stats: { avgRating, totalReviews, responseRate },
    });
  } catch (error) {
    logger.error("Operator reviews error", error);
    return NextResponse.json(
      { error: "Failed to load reviews" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const __auth = await requireOperator();
    if (!__auth.ok) return __auth.error;
    const userId = __auth.userId;

    const { reviewId, reply } = await request.json();

    if (!reviewId || !reply?.trim()) {
      return NextResponse.json(
        { error: "reviewId and reply are required" },
        { status: 400 }
      );
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Verify the review belongs to one of this operator's listings
    const [review] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .innerJoin(listings, eq(reviews.listingId, listings.id))
      .where(
        sql`${reviews.id} = ${reviewId} AND ${listings.operatorId} = ${userId}`
      );

    if (!review) {
      return NextResponse.json(
        { error: "Review not found or not yours" },
        { status: 404 }
      );
    }

    // Update the reply
    const [updated] = await db
      .update(reviews)
      .set({
        operatorReply: reply.trim(),
        operatorRepliedAt: new Date(),
      })
      .where(eq(reviews.id, reviewId))
      .returning({
        id: reviews.id,
        operatorReply: reviews.operatorReply,
        operatorRepliedAt: reviews.operatorRepliedAt,
      });

    return NextResponse.json({ review: updated });
  } catch (error) {
    logger.error("Operator reply error", error);
    return NextResponse.json(
      { error: "Failed to save reply" },
      { status: 500 }
    );
  }
}
