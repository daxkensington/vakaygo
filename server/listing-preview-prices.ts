import { and, eq, inArray, sql } from "drizzle-orm";
import { islands, listings } from "@/drizzle/schema";
import { createDb } from "@/server/db";
import { bookingLaunchEnabled } from "@/server/business-onboarding";
import { currentListingBookable } from "@/server/listing-bookability-sql";
import { publicDirectoryListings } from "@/server/public-listing-eligibility";

/** Small fresh read for browser history; stored prices never authorize advertising a price. */
export async function getListingPreviewPrices(ids: string[]) {
  const db = createDb();
  const enabled = await bookingLaunchEnabled();
  const rows = await db.select({
    id: listings.id, priceAmount: listings.priceAmount, priceCurrency: listings.priceCurrency, priceUnit: listings.priceUnit,
    bookingEligible: enabled ? currentListingBookable() : sql<boolean>`false`,
  }).from(listings).innerJoin(islands, eq(listings.islandId, islands.id)).where(and(
    inArray(listings.id, ids), publicDirectoryListings(),
  ));
  return rows.map(row => ({ ...row, bookingEligible: row.bookingEligible === true,
    priceAmount: row.bookingEligible === true ? row.priceAmount : null }));
}
