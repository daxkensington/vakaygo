import { sql } from "drizzle-orm";
import { listings } from "@/drizzle/schema";

/**
 * Whose rating `listings.avg_rating` / `review_count` hold. Imported listings
 * carry Google's figures; the same rule lives in lib/listing-display.ts
 * (`listingRatingSource`) and server/listings-search.ts. Keep them in step.
 */
export const listingReviewSourceSql = sql<"google" | "vakaygo">`
  CASE WHEN ${listings.typeData}->>'unclaimed' = 'true'
         OR ${listings.typeData}->>'source' = 'google-places'
       THEN 'google' ELSE 'vakaygo' END`;

/** True when the rating columns hold Google's figures, which a VakayGo review must not overwrite. */
export const listingRatingIsGoogleSql = sql<boolean>`(
  coalesce(${listings.typeData}->>'unclaimed', '') = 'true'
  OR coalesce(${listings.typeData}->>'source', '') = 'google-places')`;
