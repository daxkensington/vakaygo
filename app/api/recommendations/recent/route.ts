import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, listingViews, islands, media } from "@/drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { verifySession } from "@/server/admin-auth";
import { sameSessionIdentity } from "@/lib/session-identity";
import { publicDirectoryListings } from "@/server/public-listing-eligibility";
import { bookingLaunchEnabled } from "@/server/business-onboarding";
import { getImageUrl } from "@/lib/image-utils";
import { currentListingBookable } from "@/server/listing-bookability-sql";
const headers = { "Cache-Control": "private, no-store" };

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET() {
  try {
    const actor = await verifySession();
    if (!actor) {
      return NextResponse.json({ listings: [] }, { headers });
    }
    const userId = actor.userId;
    const bookingsEnabled = await bookingLaunchEnabled();

    const db = getDb();

    // Get the latest view for each distinct active listing
    const recent = await db
      .selectDistinctOn([listingViews.listingId], {
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        headline: listings.headline,
        priceAmount: listings.priceAmount,
        bookingEligible: bookingsEnabled ? currentListingBookable() : sql<boolean>`false`,
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
          publicDirectoryListings()
        )
      )
      .orderBy(listingViews.listingId, desc(listingViews.createdAt));

    // Sort by most recently viewed
    recent.sort((a, b) => {
      const aTime = a.viewedAt ? new Date(a.viewedAt).getTime() : 0;
      const bTime = b.viewedAt ? new Date(b.viewedAt).getTime() : 0;
      return bTime - aTime;
    });

    if (!sameSessionIdentity(actor, await verifySession())) {
      return NextResponse.json({ error: "Your session changed. Please reload." }, { status: 401, headers });
    }
    return NextResponse.json({ listings: recent.slice(0, 4).map(row => ({ ...row,
      bookingEligible: row.bookingEligible === true,
      priceAmount: row.bookingEligible === true ? row.priceAmount : null,
      image: getImageUrl(row.image) || null,
    })) }, { headers });
  } catch (error) {
    logger.error("Recent views error", error);
    return NextResponse.json({ listings: [] }, { headers });
  }
}
