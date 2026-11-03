import { and, asc, eq, gt, sql } from "drizzle-orm";
import { islands, listings, media } from "@/drizzle/schema";
import { createDb } from "@/server/db";
import { bookingLaunchEnabled } from "@/server/business-onboarding";
import { getImageUrl } from "@/lib/image-utils";
import { MAP_INITIAL_PAGE_SIZE, MAP_PAGE_SIZE, MAP_PAGE_BYTE_LIMIT, type MapListingPage } from "@/lib/map-listings";
import { publicMapLocations } from "@/server/map-listing-eligibility";
import { currentListingBookable } from "@/server/listing-bookability-sql";

/** Keyset pages keep reads bounded and do not silently omit the 7,501st listing. */
export async function getMapListingPage(island: string | null, cursor: string | null, largePages = false): Promise<MapListingPage> {
  const db = createDb();
  const publicLocations = publicMapLocations(island);
  const enabled = await bookingLaunchEnabled();
  // Larger continuations require an explicit protocol opt-in: open older tabs
  // retain their original 250-row parser limit throughout a deployment.
  const pageSize = cursor && largePages ? MAP_PAGE_SIZE : MAP_INITIAL_PAGE_SIZE;
  const [rows, countRows] = await Promise.all([
    db.select({
      id: listings.id, title: listings.title, slug: listings.slug, type: listings.type,
      priceAmount: listings.priceAmount, priceCurrency: listings.priceCurrency, priceUnit: listings.priceUnit,
      avgRating: listings.avgRating, reviewCount: listings.reviewCount, parish: listings.parish,
      islandSlug: islands.slug, islandName: islands.name, isFeatured: listings.isFeatured,
      latitude: listings.latitude, longitude: listings.longitude,
      bookingEligible: enabled ? currentListingBookable() : sql<boolean>`false`,
      // Only one small page of image lookups; never thousands of IN parameters.
      image: sql<string | null>`(SELECT ${media.url} FROM ${media} WHERE ${media.listingId} = ${listings.id} ORDER BY ${media.isPrimary} DESC NULLS LAST, ${media.sortOrder} ASC LIMIT 1)`,
    }).from(listings).innerJoin(islands, eq(listings.islandId, islands.id))
      .where(and(publicLocations, cursor ? gt(listings.id, cursor) : undefined))
      .orderBy(asc(listings.id)).limit(pageSize + 1),
    cursor ? Promise.resolve(null) : db.select({ count: sql<number>`count(*)::int` })
      .from(listings).innerJoin(islands, eq(listings.islandId, islands.id)).where(publicLocations),
  ]);
  const page: MapListingPage["listings"] = [];
  // Reserve metadata and JSON punctuation. Bounded rows must also mean a
  // bounded response when a legacy photo URL is unusually long.
  let bytes = 256;
  for (const row of rows.slice(0, pageSize)) {
    const listing = { ...row, bookingEligible: row.bookingEligible === true,
      priceAmount: row.bookingEligible === true ? row.priceAmount : null,
      image: getImageUrl(row.image, { width: 400 }) || null };
    let rowBytes = Buffer.byteLength(JSON.stringify(listing), "utf8") + 1;
    if (rowBytes > MAP_PAGE_BYTE_LIMIT - 256) {
      // Keep the location/link; a broken or huge thumbnail must not block it.
      listing.image = null;
      rowBytes = Buffer.byteLength(JSON.stringify(listing), "utf8") + 1;
    }
    if (page.length && bytes + rowBytes > MAP_PAGE_BYTE_LIMIT) break;
    page.push(listing);
    bytes += rowBytes;
  }
  return {
    listings: page,
    // Includes byte-budget truncation: resume after the last delivered ID, so
    // fetched but undelivered rows are read again rather than skipped.
    nextCursor: rows.length > page.length ? page.at(-1)!.id : null,
    totalCount: countRows?.[0]?.count ?? null,
  };
}
