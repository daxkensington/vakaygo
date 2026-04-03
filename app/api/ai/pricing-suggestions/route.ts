import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { listings, islands } from "@/drizzle/schema";
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

    // Fetch the target listing
    const [listing] = await db
      .select({
        id: listings.id,
        title: listings.title,
        type: listings.type,
        priceAmount: listings.priceAmount,
        priceUnit: listings.priceUnit,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        islandId: listings.islandId,
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

    // Get island name
    const [island] = await db
      .select({ name: islands.name })
      .from(islands)
      .where(eq(islands.id, listing.islandId))
      .limit(1);

    // Fetch comparable listings (same type + same island, active)
    const comparables = await db
      .select({
        priceAmount: listings.priceAmount,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        title: listings.title,
      })
      .from(listings)
      .where(
        and(
          eq(listings.type, listing.type),
          eq(listings.islandId, listing.islandId),
          eq(listings.status, "active"),
          sql`${listings.priceAmount} IS NOT NULL AND ${listings.priceAmount} > 0`
        )
      );

    const prices = comparables
      .map((c) => parseFloat(c.priceAmount || "0"))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    const competitorCount = prices.length;
    const low = prices.length > 0 ? prices[0] : 0;
    const high = prices.length > 0 ? prices[prices.length - 1] : 0;
    const median =
      prices.length > 0
        ? prices.length % 2 === 0
          ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
          : prices[Math.floor(prices.length / 2)]
        : 0;

    const currentPrice = parseFloat(listing.priceAmount || "0");
    const currentRating = parseFloat(listing.avgRating || "0");
    const currentReviewCount = listing.reviewCount || 0;

    // Calculate avg rating for comparables
    const ratedComparables = comparables.filter(
      (c) => parseFloat(c.avgRating || "0") > 0
    );
    const avgCompRating =
      ratedComparables.length > 0
        ? ratedComparables.reduce(
            (sum, c) => sum + parseFloat(c.avgRating || "0"),
            0
          ) / ratedComparables.length
        : 0;

    // Avg price for high-rated listings
    const highRatedComps = comparables.filter(
      (c) =>
        parseFloat(c.avgRating || "0") >= 4.5 &&
        parseFloat(c.priceAmount || "0") > 0
    );
    const avgHighRatedPrice =
      highRatedComps.length > 0
        ? highRatedComps.reduce(
            (sum, c) => sum + parseFloat(c.priceAmount || "0"),
            0
          ) / highRatedComps.length
        : 0;

    const islandName = island?.name || "this island";
    const listingType = listing.type;

    const prompt = `You are a pricing strategist for a Caribbean travel platform. Analyze this listing's pricing and provide a suggestion.

Listing: "${listing.title}" (${listingType})
Location: ${islandName}
Current Price: $${currentPrice} per ${listing.priceUnit || "unit"}
Rating: ${currentRating > 0 ? currentRating.toFixed(1) + "/5" : "No ratings yet"} (${currentReviewCount} reviews)

Competitor Data (${competitorCount} comparable ${listingType} listings on ${islandName}):
- Price Range: $${low.toFixed(0)} - $${high.toFixed(0)}
- Median Price: $${median.toFixed(0)}
- Avg Rating of Comparables: ${avgCompRating > 0 ? avgCompRating.toFixed(1) : "N/A"}
${avgHighRatedPrice > 0 ? `- Avg Price for 4.5+ Rated: $${avgHighRatedPrice.toFixed(0)}` : ""}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "suggestedPrice": number,
  "reasoning": "1-2 sentence explanation of the suggestion",
  "seasonalTip": "One seasonal pricing tip for this Caribbean destination",
  "insights": ["3-4 specific, data-driven pricing insights"]
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini error:", err);
      return NextResponse.json(
        { error: "AI analysis failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    let parsed: {
      suggestedPrice: number;
      reasoning: string;
      seasonalTip: string;
      insights: string[];
    };
    try {
      const jsonStr = rawText.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse pricing JSON:", rawText);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      currentPrice,
      suggestedPrice: parsed.suggestedPrice,
      reasoning: parsed.reasoning,
      competitorRange: { low, median, high },
      competitorCount,
      seasonalTip: parsed.seasonalTip,
      insights: parsed.insights,
    });
  } catch (error) {
    console.error("Pricing suggestions error:", error);
    return NextResponse.json(
      { error: "Failed to generate pricing suggestions" },
      { status: 500 }
    );
  }
}
