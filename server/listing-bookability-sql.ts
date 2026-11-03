import { sql } from "drizzle-orm";
import { listingOnboarding, listings } from "@/drizzle/schema";

/** Skip expensive readiness checks only when their necessary activation is absent. */
export function currentListingBookable() {
  return sql<boolean>`CASE WHEN EXISTS (
    SELECT 1 FROM ${listingOnboarding}
    WHERE ${listingOnboarding.listingId} = ${listings.id}
      AND ${listingOnboarding.activatedAt} IS NOT NULL
  ) THEN vakaygo_listing_bookable(${listings.id}) ELSE false END`;
}
