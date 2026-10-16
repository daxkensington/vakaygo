import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { islands, listings } from "@/drizzle/schema";
import { createDb } from "@/server/db";
import { bookingLaunchEnabled } from "@/server/business-onboarding";

/** Small fresh read for browser history; stored prices never authorize advertising a price. */
export async function getListingPreviewPrices(ids: string[]) {
  const db = createDb();
  const enabled = await bookingLaunchEnabled();
  const rows = await db.select({
    id: listings.id, priceAmount: listings.priceAmount, priceCurrency: listings.priceCurrency, priceUnit: listings.priceUnit,
    bookingEligible: enabled ? sql<boolean>`vakaygo_listing_bookable(${listings.id})` : sql<boolean>`false`,
  }).from(listings).innerJoin(islands, eq(listings.islandId, islands.id)).where(and(
    inArray(listings.id, ids), eq(listings.status, "active"), eq(islands.isActive, true),
    ne(listings.operatorId, "197d8586-7fd3-4999-91de-a50ad7d70e23"),
  ));
  return rows.map(row => ({ ...row, bookingEligible: row.bookingEligible === true,
    priceAmount: row.bookingEligible === true ? row.priceAmount : null }));
}
