import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, listings, islands, media, reviews } from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { id } = await params;

    // Fetch operator (only if role is 'operator')
    const [operator] = await db
      .select({
        id: users.id,
        name: users.name,
        businessName: users.businessName,
        businessDescription: users.businessDescription,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, "operator")));

    if (!operator) {
      return NextResponse.json(
        { error: "Operator not found" },
        { status: 404 }
      );
    }

    // Fetch active listings with primary image and island info
    const operatorListings = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        priceAmount: listings.priceAmount,
        priceUnit: listings.priceUnit,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        parish: listings.parish,
        isFeatured: listings.isFeatured,
        islandSlug: islands.slug,
        islandName: islands.name,
        image: sql<string | null>`(
          SELECT ${media.url}
          FROM ${media}
          WHERE ${media.listingId} = ${listings.id}
          ORDER BY ${media.isPrimary} DESC, ${media.sortOrder} ASC
          LIMIT 1
        )`,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(
        and(eq(listings.operatorId, id), eq(listings.status, "active"))
      )
      .orderBy(desc(listings.isFeatured), desc(listings.createdAt));

    // Aggregate stats from the active listings
    const totalListings = operatorListings.length;
    const totalReviews = operatorListings.reduce(
      (sum, l) => sum + (l.reviewCount ?? 0),
      0
    );
    const ratingsWithReviews = operatorListings.filter(
      (l) => l.avgRating && parseFloat(l.avgRating) > 0 && (l.reviewCount ?? 0) > 0
    );
    const avgRating =
      ratingsWithReviews.length > 0
        ? ratingsWithReviews.reduce(
            (sum, l) => sum + parseFloat(l.avgRating!) * (l.reviewCount ?? 1),
            0
          ) / ratingsWithReviews.reduce((sum, l) => sum + (l.reviewCount ?? 1), 0)
        : 0;

    return NextResponse.json({
      operator,
      listings: operatorListings,
      stats: {
        totalListings,
        totalReviews,
        avgRating: Math.round(avgRating * 100) / 100,
      },
    });
  } catch (error) {
    console.error("Operator profile error:", error);
    return NextResponse.json(
      { error: "Failed to fetch operator profile" },
      { status: 500 }
    );
  }
}
