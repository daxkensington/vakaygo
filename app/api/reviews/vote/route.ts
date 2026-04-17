import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reviews, reviewVotes } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * POST — Toggle helpful vote on a review
 * Body: { reviewId: string }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { reviewId } = await request.json();
    if (!reviewId) {
      return NextResponse.json({ error: "reviewId required" }, { status: 400 });
    }

    const db = getDb();

    // Check if user already voted
    const existing = await db
      .select()
      .from(reviewVotes)
      .where(
        and(eq(reviewVotes.userId, userId), eq(reviewVotes.reviewId, reviewId))
      )
      .limit(1);

    if (existing.length > 0) {
      // Remove vote
      await db
        .delete(reviewVotes)
        .where(
          and(
            eq(reviewVotes.userId, userId),
            eq(reviewVotes.reviewId, reviewId)
          )
        );

      // Decrement helpful count
      await db
        .update(reviews)
        .set({ helpfulCount: sql`${reviews.helpfulCount} - 1` })
        .where(eq(reviews.id, reviewId));

      return NextResponse.json({ voted: false });
    } else {
      // Add vote
      await db.insert(reviewVotes).values({ userId, reviewId });

      // Increment helpful count
      await db
        .update(reviews)
        .set({ helpfulCount: sql`${reviews.helpfulCount} + 1` })
        .where(eq(reviews.id, reviewId));

      return NextResponse.json({ voted: true });
    }
  } catch (error) {
    logger.error("Review vote error", error);
    return NextResponse.json(
      { error: "Failed to toggle vote" },
      { status: 500 }
    );
  }
}
