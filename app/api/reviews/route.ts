import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reviews, listings, users, reviewPhotos, reviewSubRatings } from "@/drizzle/schema";
import { sendNewReviewNotification } from "@/server/email";
import { createNotification } from "@/server/notifications";
import { awardReviewPoints } from "@/server/loyalty";
import { eq, and, sql, inArray } from "drizzle-orm";
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
        helpfulCount: reviews.helpfulCount,
        isVerifiedPurchase: reviews.isVerifiedPurchase,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.travelerId, users.id))
      .where(and(eq(reviews.listingId, listingId), eq(reviews.isPublished, true)))
      .orderBy(reviews.createdAt);

    // Fetch photos for all reviews in one query
    const reviewIds = result.map((r) => r.id);
    let photosMap: Record<string, { id: string; url: string; alt: string | null; width: number | null; height: number | null }[]> = {};
    if (reviewIds.length > 0) {
      const photos = await db
        .select({
          id: reviewPhotos.id,
          reviewId: reviewPhotos.reviewId,
          url: reviewPhotos.url,
          alt: reviewPhotos.alt,
          width: reviewPhotos.width,
          height: reviewPhotos.height,
        })
        .from(reviewPhotos)
        .where(inArray(reviewPhotos.reviewId, reviewIds));

      for (const photo of photos) {
        if (!photosMap[photo.reviewId]) photosMap[photo.reviewId] = [];
        photosMap[photo.reviewId].push({
          id: photo.id,
          url: photo.url,
          alt: photo.alt,
          width: photo.width,
          height: photo.height,
        });
      }
    }

    // Fetch sub-ratings for all reviews
    let subRatingsMap: Record<string, { category: string; rating: number }[]> = {};
    if (reviewIds.length > 0) {
      const subRatings = await db
        .select({
          reviewId: reviewSubRatings.reviewId,
          category: reviewSubRatings.category,
          rating: reviewSubRatings.rating,
        })
        .from(reviewSubRatings)
        .where(inArray(reviewSubRatings.reviewId, reviewIds));

      for (const sr of subRatings) {
        if (!subRatingsMap[sr.reviewId]) subRatingsMap[sr.reviewId] = [];
        subRatingsMap[sr.reviewId].push({
          category: sr.category,
          rating: sr.rating,
        });
      }
    }

    const reviewsWithExtras = result.map((r) => ({
      ...r,
      photos: photosMap[r.id] || [],
      subRatings: subRatingsMap[r.id] || [],
    }));

    return NextResponse.json({ reviews: reviewsWithExtras });
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

    const { bookingId, listingId, rating, title, comment, photoUrls } = await request.json();

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

    // Insert review photos if provided
    if (Array.isArray(photoUrls) && photoUrls.length > 0) {
      const photoRecords = photoUrls.slice(0, 5).map((p: { url: string; alt?: string; width?: number; height?: number }) => ({
        reviewId: review.id,
        url: p.url,
        alt: p.alt || null,
        width: p.width || null,
        height: p.height || null,
      }));
      await db.insert(reviewPhotos).values(photoRecords);
    }

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

    // Award loyalty points for leaving a review (non-blocking)
    awardReviewPoints(travelerId, bookingId).catch((err) => {
      console.error("Failed to award review points:", err);
    });

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

        // In-app notification to operator about new review
        createNotification({
          userId: listing.operatorId,
          type: "review",
          title: `New ${rating}-star review from ${traveler?.name || "a traveler"}`,
          body: `${listing.title}${comment ? ` — "${comment.slice(0, 80)}${comment.length > 80 ? "..." : ""}"` : ""}`,
          link: `/operator/reviews`,
        }).catch(() => {});
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
