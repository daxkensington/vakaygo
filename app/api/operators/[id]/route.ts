import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, listings, islands, media } from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";
import { publicDirectoryListings } from "@/server/public-listing-eligibility";
import { bookingLaunchEnabled } from "@/server/business-onboarding";
import { currentListingBookable } from "@/server/listing-bookability-sql";

import { logger } from "@/lib/logger";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "A valid operator ID is required" }, { status: 400 });
    }
    const db = drizzle(neon(process.env.DATABASE_URL!));

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

    const bookingsEnabled = await bookingLaunchEnabled();
    // Fetch public listings with current booking eligibility and island info.
    const operatorListings = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        priceAmount: listings.priceAmount,
        priceCurrency: listings.priceCurrency,
        priceUnit: listings.priceUnit,
        bookingEligible: bookingsEnabled ? currentListingBookable() : sql<boolean>`false`,
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
        and(eq(listings.operatorId, id), publicDirectoryListings())
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

    const transformedListings = operatorListings.map((l) => ({
      ...l,
      bookingEligible: l.bookingEligible === true,
      priceAmount: l.bookingEligible === true ? l.priceAmount : null,
      image: getImageUrl(l.image) || null,
    }));

    return NextResponse.json({
      operator,
      listings: transformedListings,
      stats: {
        totalListings,
        totalReviews,
        avgRating: Math.round(avgRating * 100) / 100,
      },
    });
  } catch (error) {
    logger.error("Operator profile error", error);
    return NextResponse.json(
      { error: "Failed to fetch operator profile" },
      { status: 500 }
    );
  }
}
