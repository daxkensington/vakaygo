import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reviews, listings, users, reviewPhotos, reviewSubRatings, bookings } from "@/drizzle/schema";
import { sendNewReviewNotification } from "@/server/email";
import { createNotification } from "@/server/notifications";
import { awardReviewPoints } from "@/server/loyalty";
import { eq, and, sql, inArray } from "drizzle-orm";
import { verifyCurrentSessionToken } from "@/server/session-validation";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import { revalidateListing } from "@/lib/revalidate-listing";
import { listingRatingIsGoogleSql } from "@/server/listing-review-source";

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
    const photosMap: Record<string, { id: string; url: string; alt: string | null; width: number | null; height: number | null }[]> = {};
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
    const subRatingsMap: Record<string, { category: string; rating: number }[]> = {};
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
    logger.error("Reviews error", error);
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

    const currentSession = await verifyCurrentSessionToken(token);
    if (!currentSession) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = { ...currentSession, id: currentSession.userId };
    const travelerId = payload.id as string;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    // listingId is intentionally NOT taken from the client — it is derived
    // from the verified booking below.
    const { bookingId, rating, title: rawTitle, comment: rawComment, photoUrls } = body as Record<string, unknown>;

    if (typeof bookingId !== "string" || bookingId.trim().length === 0) {
      return NextResponse.json({ error: "bookingId must be a non-empty string" }, { status: 400 });
    }

    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be an integer from 1 to 5" }, { status: 400 });
    }

    if (rawTitle !== undefined && rawTitle !== null && typeof rawTitle !== "string") {
      return NextResponse.json({ error: "title must be a string or null" }, { status: 400 });
    }
    if (rawComment !== undefined && rawComment !== null && typeof rawComment !== "string") {
      return NextResponse.json({ error: "comment must be a string or null" }, { status: 400 });
    }
    const title = typeof rawTitle === "string" ? rawTitle.trim() || null : null;
    const comment = typeof rawComment === "string" ? rawComment.trim() || null : null;
    if (title && title.length > 200) {
      return NextResponse.json({ error: "title must be at most 200 characters" }, { status: 400 });
    }
    if (comment && comment.length > 5000) {
      return NextResponse.json({ error: "comment must be at most 5000 characters" }, { status: 400 });
    }

    const validatedPhotos: { url: string; alt: string | null; width: number | null; height: number | null }[] = [];
    if (photoUrls !== undefined) {
      if (!Array.isArray(photoUrls) || photoUrls.length > 5) {
        return NextResponse.json({ error: "photoUrls must be an array of at most 5 photos" }, { status: 400 });
      }
      for (let i = 0; i < photoUrls.length; i++) {
        const photo: unknown = photoUrls[i];
        if (photo === null || typeof photo !== "object" || Array.isArray(photo)) {
          return NextResponse.json({ error: `photoUrls[${i}] must be an object` }, { status: 400 });
        }
        const { url, alt, width, height } = photo as Record<string, unknown>;
        if (typeof url !== "string") {
          return NextResponse.json({ error: `photoUrls[${i}].url must be a valid HTTPS URL` }, { status: 400 });
        }
        try {
          if (new URL(url).protocol !== "https:") {
            return NextResponse.json({ error: `photoUrls[${i}].url must use HTTPS` }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ error: `photoUrls[${i}].url must be a valid HTTPS URL` }, { status: 400 });
        }
        if (alt !== undefined && (typeof alt !== "string" || alt.length > 300)) {
          return NextResponse.json({ error: `photoUrls[${i}].alt must be a string of at most 300 characters` }, { status: 400 });
        }
        if (width !== undefined && (typeof width !== "number" || !Number.isFinite(width) || !Number.isInteger(width) || width <= 0)) {
          return NextResponse.json({ error: `photoUrls[${i}].width must be a finite positive integer` }, { status: 400 });
        }
        if (height !== undefined && (typeof height !== "number" || !Number.isFinite(height) || !Number.isInteger(height) || height <= 0)) {
          return NextResponse.json({ error: `photoUrls[${i}].height must be a finite positive integer` }, { status: 400 });
        }
        validatedPhotos.push({
          url,
          alt: typeof alt === "string" ? alt || null : null,
          width: typeof width === "number" ? width : null,
          height: typeof height === "number" ? height : null,
        });
      }
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // SECURITY: the booking must belong to the reviewer and be completed,
    // otherwise anyone could post (and inflate/deflate) ratings on arbitrary
    // listings. Derive the listingId from the booking, never the client.
    const [booking] = await db
      .select({
        id: bookings.id,
        travelerId: bookings.travelerId,
        listingId: bookings.listingId,
        status: bookings.status,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking || booking.travelerId !== travelerId) {
      return NextResponse.json(
        { error: "You can only review your own bookings" },
        { status: 403 }
      );
    }
    if (booking.status !== "completed") {
      return NextResponse.json(
        { error: "You can only review a completed booking" },
        { status: 400 }
      );
    }

    const listingId = booking.listingId;

    // One review per booking.
    const [existingReview] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.bookingId, bookingId))
      .limit(1);
    if (existingReview) {
      return NextResponse.json(
        { error: "You have already reviewed this booking" },
        { status: 409 }
      );
    }

    const [review] = await db
      .insert(reviews)
      .values({
        bookingId,
        listingId,
        travelerId,
        rating,
        title,
        comment,
        isVerifiedPurchase: true,
      })
      .returning({ id: reviews.id });

    // Insert review photos if provided
    if (validatedPhotos.length > 0) {
      const photoRecords = validatedPhotos.map((photo) => ({
        reviewId: review.id,
        ...photo,
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

    // On an imported listing these columns hold Google's rating and count, and
    // every page labels them "Google". Writing the VakayGo average over them
    // would show one VakayGo review as "5.0 (1 Google reviews)" and lose
    // Google's figures for good. VakayGo reviews on such a listing are shown
    // by the reviews section, which computes its own average.
    if (ratingResult[0]) {
      await db
        .update(listings)
        .set({
          avgRating: parseFloat(ratingResult[0].avg).toFixed(2),
          reviewCount: ratingResult[0].count,
        })
        .where(and(eq(listings.id, listingId), sql`NOT ${listingRatingIsGoogleSql}`));
    }
    await revalidateListing(listingId);

    // Award loyalty points for leaving a review (non-blocking)
    awardReviewPoints(travelerId, bookingId).catch((err) => {
      logger.error("Failed to award review points", err);
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
    } catch {
      // Email failure should not break the review response
    }

    return NextResponse.json({ review });
  } catch (error) {
    // The SELECT dedupe above is racy; reviews.bookingId also has a UNIQUE
    // constraint, so a concurrent double-submit surfaces here as a unique
    // violation — translate it to the friendly 409 rather than a 500.
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message.toLowerCase() : "";
    if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique")) {
      return NextResponse.json(
        { error: "You have already reviewed this booking" },
        { status: 409 }
      );
    }
    logger.error("Create review error", error);
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }
}
