import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import {
  listings,
  listingViews,
  savedListings,
  bookings,
  islands,
  media,
} from "@/drizzle/schema";
import { eq, and, sql, desc, notInArray, inArray } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

type ListingRow = {
  id: string;
  title: string;
  slug: string;
  type: string;
  headline: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  isFeatured: boolean | null;
  islandId: number;
  islandSlug: string;
  islandName: string;
  image: string | null;
};

export async function GET() {
  try {
    const db = getDb();

    // Try to get authenticated user
    let userId: string | null = null;
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get("session")?.value;
      if (token) {
        const { payload } = await jwtVerify(token, SECRET);
        userId = payload.id as string;
      }
    } catch {
      // anonymous user
    }

    // Anonymous users: return top-rated/featured listings
    if (!userId) {
      const popular = await db
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
          islandId: listings.islandId,
          islandSlug: islands.slug,
          islandName: islands.name,
          image: media.url,
        })
        .from(listings)
        .innerJoin(islands, eq(listings.islandId, islands.id))
        .leftJoin(
          media,
          and(eq(media.listingId, listings.id), eq(media.isPrimary, true))
        )
        .where(eq(listings.status, "active"))
        .orderBy(desc(listings.isFeatured), desc(listings.avgRating))
        .limit(12);

      const withImages = popular.map((p) => ({ ...p, image: getImageUrl(p.image) || null }));
      return NextResponse.json({
        recommended: withImages.slice(0, 6),
        popular: withImages.slice(6, 12),
        isPersonalized: false,
      });
    }

    // Authenticated user: get preferences from history

    // 1. Recent views (last 30)
    const recentViews = await db
      .select({
        listingId: listingViews.listingId,
        type: listings.type,
        islandId: listings.islandId,
        priceAmount: listings.priceAmount,
      })
      .from(listingViews)
      .innerJoin(listings, eq(listingViews.listingId, listings.id))
      .where(eq(listingViews.userId, userId))
      .orderBy(desc(listingViews.createdAt))
      .limit(30);

    // 2. Saved listings
    const saved = await db
      .select({
        listingId: savedListings.listingId,
        type: listings.type,
        islandId: listings.islandId,
      })
      .from(savedListings)
      .innerJoin(listings, eq(savedListings.listingId, listings.id))
      .where(eq(savedListings.userId, userId));

    // 3. Past bookings
    const pastBookings = await db
      .select({
        listingId: bookings.listingId,
        type: listings.type,
        islandId: listings.islandId,
      })
      .from(bookings)
      .innerJoin(listings, eq(bookings.listingId, listings.id))
      .where(eq(bookings.travelerId, userId));

    // Extract preferences
    const viewedIds = recentViews.map((v) => v.listingId);
    const bookedIds = pastBookings.map((b) => b.listingId);
    const excludeIds = [...new Set([...viewedIds, ...bookedIds])];

    const typeCounts: Record<string, number> = {};
    const islandCounts: Record<number, number> = {};

    for (const item of [...recentViews, ...saved, ...pastBookings]) {
      typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
      islandCounts[item.islandId] = (islandCounts[item.islandId] || 0) + 1;
    }

    const preferredTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    const preferredIslands = Object.entries(islandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => parseInt(id));

    // Get candidate listings (exclude already viewed/booked)
    const candidates = await db
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
        islandId: listings.islandId,
        islandSlug: islands.slug,
        islandName: islands.name,
        image: media.url,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .leftJoin(
        media,
        and(eq(media.listingId, listings.id), eq(media.isPrimary, true))
      )
      .where(
        excludeIds.length > 0
          ? and(
              eq(listings.status, "active"),
              notInArray(listings.id, excludeIds)
            )
          : eq(listings.status, "active")
      )
      .limit(50);

    // Fix image URLs through proxy
    const candidatesWithImages = candidates.map((c) => ({ ...c, image: getImageUrl(c.image) || null }));

    // Score candidates
    const scored = candidatesWithImages.map((listing) => {
      let score = 0;
      let reason = "Popular on VakayGo";

      if (preferredTypes.includes(listing.type)) {
        score += 3;
        const typeLabel =
          listing.type.charAt(0).toUpperCase() + listing.type.slice(1);
        reason = `Based on your interest in ${typeLabel.toLowerCase()}s`;
      }
      if (preferredIslands.includes(listing.islandId)) {
        score += 2;
        reason = `Popular in ${listing.islandName}`;
      }
      if (listing.avgRating && parseFloat(listing.avgRating) >= 4.0) {
        score += 1;
      }
      if (listing.isFeatured) {
        score += 1;
      }

      return { ...listing, score, reason };
    });

    scored.sort((a, b) => b.score - a.score);

    const recommended = scored.slice(0, 6);
    const popular = scored.slice(6, 12);

    // If we don't have enough personalized results, pad with top-rated
    const hasPersonalData =
      recentViews.length > 0 || saved.length > 0 || pastBookings.length > 0;

    return NextResponse.json({
      recommended,
      popular,
      isPersonalized: hasPersonalData,
    });
  } catch (error) {
    logger.error("Recommendations error", error);
    return NextResponse.json(
      { error: "Failed to get recommendations" },
      { status: 500 }
    );
  }
}
