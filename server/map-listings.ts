import { and, asc, eq, gt, sql } from "drizzle-orm";
import { islands, listings, media } from "@/drizzle/schema";
import { createDb } from "@/server/db";
import { bookingLaunchEnabled } from "@/server/business-onboarding";
import { getImageUrl } from "@/lib/image-utils";
import { MAP_PAGE_SIZE, type MapListingPage } from "@/lib/map-listings";
import { publicMapLocations } from "@/server/map-listing-eligibility";

/** Keyset pages keep reads bounded and do not silently omit the 7,501st listing. */
export async function getMapListingPage(island: string | null, cursor: string | null): Promise<MapListingPage> {
  const db = createDb();
  const publicLocations = publicMapLocations(island);
  const enabled = await bookingLaunchEnabled();
  const [rows, countRows] = await Promise.all([
    db.select({
      id: listings.id, title: listings.title, slug: listings.slug, type: listings.type,
      priceAmount: listings.priceAmount, priceCurrency: listings.priceCurrency, priceUnit: listings.priceUnit,
      avgRating: listings.avgRating, reviewCount: listings.reviewCount, parish: listings.parish,
      islandSlug: islands.slug, islandName: islands.name, isFeatured: listings.isFeatured,
      latitude: listings.latitude, longitude: listings.longitude,
      bookingEligible: enabled ? sql<boolean>`vakaygo_listing_bookable(${listings.id})` : sql<boolean>`false`,
      // Only one small page of image lookups; never thousands of IN parameters.
      image: sql<string | null>`(SELECT ${media.url} FROM ${media} WHERE ${media.listingId} = ${listings.id} ORDER BY ${media.isPrimary} DESC NULLS LAST, ${media.sortOrder} ASC LIMIT 1)`,
    }).from(listings).innerJoin(islands, eq(listings.islandId, islands.id))
      .where(and(publicLocations, cursor ? gt(listings.id, cursor) : undefined))
      .orderBy(asc(listings.id)).limit(MAP_PAGE_SIZE + 1),
    cursor ? Promise.resolve(null) : db.select({ count: sql<number>`count(*)::int` })
      .from(listings).innerJoin(islands, eq(listings.islandId, islands.id)).where(publicLocations),
  ]);
  const page = rows.slice(0, MAP_PAGE_SIZE);
  return {
    listings: page.map(row => ({ ...row, bookingEligible: row.bookingEligible === true,
      priceAmount: row.bookingEligible === true ? row.priceAmount : null,
      image: getImageUrl(row.image, { width: 400 }) || null })),
    nextCursor: rows.length > MAP_PAGE_SIZE ? page.at(-1)!.id : null,
    totalCount: countRows?.[0]?.count ?? null,
  };
}
