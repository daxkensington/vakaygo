import { LISTING_TYPES } from "@/lib/listing-filters";
import type { MapListing } from "@/components/listings/caribbean-map";

/** Keep the first paint small; only v2 continuations opt into the larger bound. */
export const MAP_INITIAL_PAGE_SIZE = 250;
export const MAP_PAGE_SIZE = 1000;
export const MAP_PAGE_BYTE_LIMIT = 768 * 1024;
export const MAP_PAGE_TIMEOUT_MS = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MapListingPage = {
  listings: MapListing[];
  nextCursor: string | null;
  /** Count of public listings with usable map coordinates, not the whole directory. */
  totalCount: number | null;
};

function isMapListing(value: unknown): value is MapListing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!["id", "title", "slug", "type", "islandSlug", "islandName"].every(key => typeof row[key] === "string" && row[key] !== "")) return false;
  if (!(LISTING_TYPES as readonly string[]).includes(row.type as string)) return false;
  if (!["priceAmount", "priceCurrency", "priceUnit", "avgRating", "parish", "image", "latitude", "longitude"].every(key => row[key] === null || typeof row[key] === "string")) return false;
  if (typeof row.bookingEligible !== "boolean") return false;
  if (row.priceAmount !== null && row.bookingEligible !== true) return false;
  return (row.reviewCount === null || (typeof row.reviewCount === "number" && Number.isSafeInteger(row.reviewCount) && row.reviewCount >= 0))
    && (row.isFeatured === null || typeof row.isFeatured === "boolean");
}

export function hasMapCoordinates(listing: MapListing): boolean {
  if (!listing.latitude || !listing.longitude) return false;
  const latitude = Number(listing.latitude), longitude = Number(listing.longitude);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

/** Reject incomplete/error responses instead of labelling a partial directory complete. */
export function parseMapListingPage(value: unknown, island = ""): MapListingPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid map listings response");
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.listings) || page.listings.length > MAP_PAGE_SIZE
    || !page.listings.every(isMapListing)
    || !page.listings.every(listing => hasMapCoordinates(listing) && (!island || listing.islandSlug === island))
    || !(page.nextCursor === null || (typeof page.nextCursor === "string" && UUID.test(page.nextCursor)))
    || !(page.totalCount === null || (typeof page.totalCount === "number" && Number.isSafeInteger(page.totalCount) && page.totalCount >= 0))) {
    throw new Error("Invalid map listings response");
  }
  if (page.nextCursor !== null && (!page.listings.length || page.nextCursor !== page.listings.at(-1)?.id)) throw new Error("Invalid map cursor");
  return page as MapListingPage;
}
