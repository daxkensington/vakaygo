import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, media } from "@/drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

import { logger } from "@/lib/logger";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [island] = await db
      .select()
      .from(islands)
      .where(eq(islands.slug, slug))
      .limit(1);

    if (!island) {
      return NextResponse.json({ error: "Island not found" }, { status: 404 });
    }

    // Get counts by type
    const countResults = await db
      .select({
        type: listings.type,
        count: sql<number>`count(*)::int`,
      })
      .from(listings)
      .where(and(eq(listings.islandId, island.id), eq(listings.status, "active")))
      .groupBy(listings.type);

    const counts: Record<string, number> = {};
    countResults.forEach((r) => { counts[r.type] = r.count; });

    // Get featured/top listings
    const featured = await db
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
      })
      .from(listings)
      .where(and(eq(listings.islandId, island.id), eq(listings.status, "active")))
      .orderBy(desc(listings.isFeatured), desc(listings.avgRating))
      .limit(8);

    // Get images
    const featuredWithImages = await Promise.all(
      featured.map(async (f) => {
        const [img] = await db
          .select({ url: media.url })
          .from(media)
          .where(and(eq(media.listingId, f.id), eq(media.isPrimary, true)))
          .limit(1);
        return { ...f, image: getImageUrl(img?.url) || null };
      })
    );

    return NextResponse.json({
      name: island.name,
      slug: island.slug,
      description: island.description,
      counts,
      featured: featuredWithImages,
    });
  } catch (error) {
    logger.error("Island error", error);
    return NextResponse.json({ error: "Failed to fetch island" }, { status: 500 });
  }
}
