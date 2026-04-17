import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reviews, listings, users } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";

import { logger } from "@/lib/logger";
// In-memory cache for review summaries
const summaryCache = new Map<
  string,
  { summary: string; reviewCount: number; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function POST(request: Request) {
  try {
    const { listingId } = await request.json();

    if (!listingId) {
      return NextResponse.json(
        { error: "listingId is required" },
        { status: 400 }
      );
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Fetch all published reviews for this listing
    const reviewResults = await db
      .select({
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        travelerName: users.name,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.travelerId, users.id))
      .where(
        and(eq(reviews.listingId, listingId), eq(reviews.isPublished, true))
      )
      .orderBy(reviews.createdAt);

    if (reviewResults.length < 3) {
      return NextResponse.json(
        { error: "Not enough reviews for a summary" },
        { status: 400 }
      );
    }

    // Check cache — return if review count hasn't changed
    const cached = summaryCache.get(listingId);
    if (
      cached &&
      cached.reviewCount === reviewResults.length &&
      Date.now() - cached.timestamp < CACHE_TTL
    ) {
      return NextResponse.json({ summary: cached.summary, cached: true });
    }

    // Get listing info for context
    const [listing] = await db
      .select({ title: listings.title, type: listings.type })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    const reviewsText = reviewResults
      .map(
        (r) =>
          `${r.travelerName || "Traveler"} (${r.rating}/5): ${r.title ? r.title + " - " : ""}${r.comment || "No comment"}`
      )
      .join("\n");

    const prompt = `Summarize these customer reviews for a ${listing?.type || "travel"} listing called '${listing?.title || "this listing"}' in 2-3 sentences. Highlight the most common praise and any noted concerns. Be balanced and helpful.\n\nReviews:\n${reviewsText}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      logger.error("Gemini error", err);
      return NextResponse.json(
        { error: "AI summary generation failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const summary =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!summary) {
      return NextResponse.json(
        { error: "Empty summary returned" },
        { status: 502 }
      );
    }

    // Cache the result
    summaryCache.set(listingId, {
      summary,
      reviewCount: reviewResults.length,
      timestamp: Date.now(),
    });

    return NextResponse.json({ summary, cached: false });
  } catch (error) {
    logger.error("Review summary error", error);
    return NextResponse.json(
      { error: "Failed to generate review summary" },
      { status: 500 }
    );
  }
}
