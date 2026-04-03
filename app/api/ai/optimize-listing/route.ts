import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { listings, media, reviews, islands, users } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "operator" && payload.role !== "admin") {
      return NextResponse.json({ error: "Operators only" }, { status: 403 });
    }

    const { listingId } = await request.json();
    if (!listingId) {
      return NextResponse.json(
        { error: "listingId is required" },
        { status: 400 }
      );
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Fetch the listing
    const [listing] = await db
      .select({
        id: listings.id,
        title: listings.title,
        type: listings.type,
        description: listings.description,
        headline: listings.headline,
        priceAmount: listings.priceAmount,
        priceUnit: listings.priceUnit,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        islandId: listings.islandId,
        typeData: listings.typeData,
        cancellationPolicy: listings.cancellationPolicy,
        isInstantBook: listings.isInstantBook,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    // Get island
    const [island] = await db
      .select({ name: islands.name })
      .from(islands)
      .where(eq(islands.id, listing.islandId))
      .limit(1);

    // Count photos
    const [photoCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(media)
      .where(eq(media.listingId, listingId));

    // Get recent review comments
    const recentReviews = await db
      .select({
        rating: reviews.rating,
        comment: reviews.comment,
        travelerName: users.name,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.travelerId, users.id))
      .where(and(eq(reviews.listingId, listingId), eq(reviews.isPublished, true)))
      .limit(10);

    // Get competitors for context
    const [compStats] = await db
      .select({
        avgPrice: sql<string>`coalesce(avg(${listings.priceAmount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(listings)
      .where(
        and(
          eq(listings.type, listing.type),
          eq(listings.islandId, listing.islandId),
          eq(listings.status, "active")
        )
      );

    const descWordCount = listing.description
      ? listing.description.split(/\s+/).length
      : 0;
    const td = (listing.typeData || {}) as Record<string, unknown>;
    const hasIncluded = Array.isArray(td.included) && td.included.length > 0;

    const prompt = `You are a listing optimization expert for VakayGo, a Caribbean travel platform. Analyze this listing and provide a score and specific improvements.

Listing: "${listing.title}" (${listing.type})
Location: ${island?.name || "Caribbean"}
Description: ${descWordCount} words${listing.description ? ` - "${listing.description.slice(0, 200)}..."` : " - MISSING"}
Headline: ${listing.headline || "MISSING"}
Price: ${listing.priceAmount ? `$${listing.priceAmount} per ${listing.priceUnit}` : "NOT SET"}
Photos: ${photoCount.count}
Rating: ${parseFloat(listing.avgRating || "0") > 0 ? parseFloat(listing.avgRating || "0").toFixed(1) : "No ratings"} (${listing.reviewCount || 0} reviews)
Instant Book: ${listing.isInstantBook ? "Yes" : "No"}
Cancellation Policy: ${listing.cancellationPolicy || "Not set"}
Has "What's Included": ${hasIncluded ? "Yes" : "No"}

Competitors: ${compStats.count} similar ${listing.type} listings, avg price $${parseFloat(compStats.avgPrice).toFixed(0)}

Recent Reviews:
${recentReviews.map((r) => `${r.rating}/5: ${r.comment?.slice(0, 80) || "No comment"}`).join("\n") || "No reviews yet"}

Score the listing 0-100 and provide 3-5 specific improvements. Consider:
- Photos (8+ is ideal for bookings)
- Description quality and length (150-200 words ideal)
- Pricing competitiveness
- Whether they have a headline
- Whether they list what's included/excluded
- Instant book (increases conversions 30%)
- Review responses
- Overall completeness

Return ONLY valid JSON (no markdown, no code blocks):
{
  "score": number (0-100),
  "improvements": [
    {
      "category": "Photos" | "Description" | "Pricing" | "Features" | "Engagement" | "Completeness",
      "priority": "high" | "medium" | "low",
      "suggestion": "Specific, actionable suggestion with data",
      "action": "generate_description" | "add_photos" | "update_price" | "enable_instant_book" | "add_included" | null
    }
  ],
  "competitivePosition": "below_average" | "average" | "above_average" | "top_performer",
  "estimatedImpact": "One sentence about potential improvement in bookings"
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Claude error:", err);
      return NextResponse.json(
        { error: "AI analysis failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text?.trim() || "";

    let parsed: {
      score: number;
      improvements: {
        category: string;
        priority: string;
        suggestion: string;
        action: string | null;
      }[];
      competitivePosition: string;
      estimatedImpact: string;
    };
    try {
      const jsonStr = rawText.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse optimize JSON:", rawText);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      score: parsed.score,
      maxScore: 100,
      improvements: parsed.improvements,
      competitivePosition: parsed.competitivePosition,
      estimatedImpact: parsed.estimatedImpact,
    });
  } catch (error) {
    console.error("Optimize listing error:", error);
    return NextResponse.json(
      { error: "Failed to generate optimization suggestions" },
      { status: 500 }
    );
  }
}
