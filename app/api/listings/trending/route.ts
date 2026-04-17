import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, listingViews, islands, media } from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

import { logger } from "@/lib/logger";
function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET() {
  try {
    const db = getDb();

    // Get top 12 listings by view count in the last 7 days
    const trending = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        headline: listings.headline,
        priceAmount: listings.priceAmount,
        priceCurrency: listings.priceCurrency,
        priceUnit: listings.priceUnit,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        parish: listings.parish,
        isFeatured: listings.isFeatured,
        islandSlug: islands.slug,
        islandName: islands.name,
        image: media.url,
        viewCount: sql<number>`count(${listingViews.id})::int`.as("view_count"),
      })
      .from(listingViews)
      .innerJoin(listings, eq(listingViews.listingId, listings.id))
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .leftJoin(
        media,
        and(eq(media.listingId, listings.id), eq(media.isPrimary, true))
      )
      .where(
        and(
          eq(listings.status, "active"),
          sql`${listingViews.createdAt} >= now() - interval '7 days'`
        )
      )
      .groupBy(
        listings.id,
        listings.title,
        listings.slug,
        listings.type,
        listings.headline,
        listings.priceAmount,
        listings.priceCurrency,
        listings.priceUnit,
        listings.avgRating,
        listings.reviewCount,
        listings.parish,
        listings.isFeatured,
        islands.slug,
        islands.name,
        media.url
      )
      .orderBy(desc(sql`count(${listingViews.id})`))
      .limit(12);

    const data = trending.map((t) => ({
      ...t,
      image: getImageUrl(t.image) || null,
    }));

    return NextResponse.json({ trending: data });
  } catch (error) {
    logger.error("Trending error", error);
    return NextResponse.json(
      { error: "Failed to get trending listings" },
      { status: 500 }
    );
  }
}
