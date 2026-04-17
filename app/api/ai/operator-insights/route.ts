import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import {
  listings,
  bookings,
  reviews,
  listingViews,
  users,
} from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

// Cache per operator
const insightsCache = new Map<
  string,
  { insights: string[]; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    if (payload.role !== "operator" && payload.role !== "admin") {
      return NextResponse.json({ error: "Operators only" }, { status: 403 });
    }

    // Check cache
    const cached = insightsCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ insights: cached.insights, cached: true });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Fetch operator's active listings
    const operatorListings = await db
      .select({
        id: listings.id,
        title: listings.title,
        type: listings.type,
        priceAmount: listings.priceAmount,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
      })
      .from(listings)
      .where(and(eq(listings.operatorId, userId), eq(listings.status, "active")));

    if (operatorListings.length === 0) {
      return NextResponse.json({
        insights: [
          "Create your first listing to start receiving bookings and insights.",
        ],
        cached: false,
      });
    }

    const listingIds = operatorListings.map((l) => l.id);

    // Views per listing (last 7 days)
    const viewCounts = await db
      .select({
        listingId: listingViews.listingId,
        views: sql<number>`count(*)::int`,
      })
      .from(listingViews)
      .where(
        sql`${listingViews.listingId} IN (${sql.join(
          listingIds.map((id) => sql`${id}`),
          sql`, `
        )}) AND ${listingViews.createdAt} >= now() - interval '7 days'`
      )
      .groupBy(listingViews.listingId);

    // Recent bookings (last 30 days)
    const recentBookings = await db
      .select({
        listingId: bookings.listingId,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.operatorId, userId),
          sql`${bookings.createdAt} >= now() - interval '30 days'`
        )
      )
      .groupBy(bookings.listingId);

    // Recent reviews with comments
    const recentReviews = await db
      .select({
        comment: reviews.comment,
        rating: reviews.rating,
        listingTitle: listings.title,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .innerJoin(listings, eq(reviews.listingId, listings.id))
      .where(
        and(
          eq(listings.operatorId, userId),
          sql`${reviews.createdAt} >= now() - interval '30 days'`
        )
      )
      .orderBy(desc(reviews.createdAt))
      .limit(20);

    // Average response time for replies
    const [responseTimeResult] = await db
      .select({
        avgHours: sql<string>`coalesce(
          avg(extract(epoch from (${reviews.operatorRepliedAt} - ${reviews.createdAt})) / 3600),
          0
        )`,
        repliedCount: sql<number>`count(case when ${reviews.operatorReply} is not null then 1 end)::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .innerJoin(listings, eq(reviews.listingId, listings.id))
      .where(eq(listings.operatorId, userId));

    // Build context for AI
    const listingsSummary = operatorListings.map((l) => {
      const views = viewCounts.find((v) => v.listingId === l.id)?.views || 0;
      const bkgs = recentBookings.find((b) => b.listingId === l.id)?.count || 0;
      return `- "${l.title}" (${l.type}): $${l.priceAmount || "N/A"}, Rating: ${parseFloat(l.avgRating || "0") > 0 ? parseFloat(l.avgRating || "0").toFixed(1) : "N/A"}, ${l.reviewCount || 0} reviews, ${views} views last 7 days, ${bkgs} bookings last 30 days`;
    });

    const recentReviewsText = recentReviews
      .slice(0, 10)
      .map(
        (r) =>
          `${r.rating}/5 for "${r.listingTitle}": ${r.comment?.slice(0, 100) || "No comment"}`
      )
      .join("\n");

    const avgResponseHours = parseFloat(responseTimeResult.avgHours) || 0;
    const responseRate =
      responseTimeResult.totalCount > 0
        ? Math.round(
            (responseTimeResult.repliedCount / responseTimeResult.totalCount) *
              100
          )
        : 0;

    const prompt = `You are an AI business advisor for a Caribbean tourism operator on VakayGo. Generate exactly 4 actionable, specific insights based on their data.

Operator's Listings:
${listingsSummary.join("\n")}

Recent Reviews (last 30 days):
${recentReviewsText || "No recent reviews"}

Response Stats: Average reply time: ${avgResponseHours.toFixed(1)} hours, Response rate: ${responseRate}%

Rules:
- Each insight should be 1-2 sentences
- Be specific (use actual listing names, numbers, percentages)
- Mix different types: views/traffic, reviews/ratings, pricing, response time
- If a listing has high views but low bookings, mention it
- If reviews mention specific keywords repeatedly, highlight it
- If response time is slow (>4 hours), suggest improvement
- Make insights actionable with specific recommendations

Return ONLY valid JSON (no markdown, no code blocks):
{
  "insights": ["insight 1", "insight 2", "insight 3", "insight 4"]
}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a concise Caribbean tourism business advisor. Return only valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.6,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error("OpenAI error", err);
      return NextResponse.json(
        { error: "AI generation failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed: { insights: string[] };
    try {
      const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.error("Failed to parse insights JSON", content);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    // Cache
    insightsCache.set(userId, {
      insights: parsed.insights,
      timestamp: Date.now(),
    });

    return NextResponse.json({ insights: parsed.insights, cached: false });
  } catch (error) {
    logger.error("Operator insights error", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
