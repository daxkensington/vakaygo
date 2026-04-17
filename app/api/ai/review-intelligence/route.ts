import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reviews, listings, users } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";

import { logger } from "@/lib/logger";
// In-memory cache for review intelligence results
const intelligenceCache = new Map<
  string,
  { data: ReviewIntelligence; reviewCount: number; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 60 * 2; // 2 hours

type KeywordEntry = {
  word: string;
  count: number;
  sentiment: "positive" | "negative" | "neutral";
};

type ReviewIntelligence = {
  summary: string;
  sentiment: "positive" | "mixed" | "negative";
  sentimentScore: number;
  highlights: string[];
  concerns: string[];
  bestFor: string[];
  trendDirection: "improving" | "stable" | "declining";
  tipFromReviewers: string;
  keywordCloud: KeywordEntry[];
};

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
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.travelerId, users.id))
      .where(
        and(eq(reviews.listingId, listingId), eq(reviews.isPublished, true))
      )
      .orderBy(reviews.createdAt);

    if (reviewResults.length < 3) {
      return NextResponse.json(
        { error: "Not enough reviews for analysis" },
        { status: 400 }
      );
    }

    // Check cache
    const cached = intelligenceCache.get(listingId);
    if (
      cached &&
      cached.reviewCount === reviewResults.length &&
      Date.now() - cached.timestamp < CACHE_TTL
    ) {
      return NextResponse.json({ ...cached.data, cached: true });
    }

    // Get listing info for context
    const [listing] = await db
      .select({ title: listings.title, type: listings.type })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    const reviewsText = reviewResults
      .map(
        (r, i) =>
          `Review ${i + 1} (${r.rating}/5, ${new Date(r.createdAt).toISOString().slice(0, 10)}): ${r.title ? r.title + " - " : ""}${r.comment || "No comment"}`
      )
      .join("\n");

    const prompt = `Analyze these customer reviews for a ${listing?.type || "travel"} listing called "${listing?.title || "this listing"}" and return a comprehensive JSON analysis.

Reviews:
${reviewsText}

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "summary": "2-3 sentence balanced summary of the overall review sentiment",
  "sentiment": "positive" or "mixed" or "negative",
  "sentimentScore": 0.0 to 1.0 (1.0 = extremely positive),
  "highlights": ["up to 5 most praised aspects"],
  "concerns": ["up to 5 noted concerns or improvement areas, empty array if none"],
  "bestFor": ["up to 4 ideal traveler types, e.g. Couples, Families, Adventure seekers"],
  "trendDirection": "improving" or "stable" or "declining" (based on chronological review ratings),
  "tipFromReviewers": "One practical tip from the reviews for future visitors",
  "keywordCloud": [
    {"word": "keyword", "count": number_of_mentions, "sentiment": "positive" or "negative" or "neutral"}
  ]
}

For keywordCloud, extract 8-15 meaningful keywords/phrases mentioned across reviews. Count actual occurrences. Assign sentiment based on context.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      logger.error("Gemini error", err);
      return NextResponse.json(
        { error: "AI analysis failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!rawText) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 502 }
      );
    }

    // Parse JSON - handle potential markdown code blocks
    let parsed: ReviewIntelligence;
    try {
      const jsonStr = rawText.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.error("Failed to parse review intelligence JSON", rawText);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    // Cache the result
    intelligenceCache.set(listingId, {
      data: parsed,
      reviewCount: reviewResults.length,
      timestamp: Date.now(),
    });

    return NextResponse.json({ ...parsed, cached: false });
  } catch (error) {
    logger.error("Review intelligence error", error);
    return NextResponse.json(
      { error: "Failed to generate review intelligence" },
      { status: 500 }
    );
  }
}
