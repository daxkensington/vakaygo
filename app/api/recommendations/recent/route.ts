import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { listings, listingViews, islands, media } from "@/drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ listings: [] });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = getDb();

    // Get last 4 distinct recently viewed listings
    const recent = await db
      .selectDistinctOn([listingViews.listingId], {
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
        viewedAt: listingViews.createdAt,
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
          eq(listingViews.userId, userId),
          eq(listings.status, "active")
        )
      )
      .orderBy(listingViews.listingId, desc(listingViews.createdAt))
      .limit(4);

    // Sort by most recently viewed
    recent.sort((a, b) => {
      const aTime = a.viewedAt ? new Date(a.viewedAt).getTime() : 0;
      const bTime = b.viewedAt ? new Date(b.viewedAt).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ listings: recent });
  } catch (error) {
    logger.error("Recent views error", error);
    return NextResponse.json({ listings: [] });
  }
}
