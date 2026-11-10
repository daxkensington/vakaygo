import { sql } from "drizzle-orm";
import { listings } from "@/drizzle/schema";
import { LEGACY_STAY_CAPACITY_PATTERN } from "@/lib/listing-capacity";
import { currentListingClaimVerified } from "@/server/listing-bookability-sql";

/** The operator-maintained column wins; only older imports fall back to valid JSON. Unknown stays do not match a requested capacity. */
export const stayGuestCapacity = sql<number | null>`coalesce(${listings.maxGuests}, CASE
  WHEN ${listings.typeData}->>'maxGuests' ~ ${LEGACY_STAY_CAPACITY_PATTERN}
  THEN (${listings.typeData}->>'maxGuests')::int ELSE NULL END)`;

/**
 * Whether a stay can be offered to a party of `guests`. Imported stays carry a
 * type-default capacity (4) that no business stated, so their capacity is
 * unknown and they are kept; a stay whose business verified its ownership is
 * held to the capacity it set. (Before this, asking for 5 guests hid 873 of
 * 874 stays.)
 */
export function stayFitsGuests(guests: number) {
  return sql<boolean>`(NOT (${currentListingClaimVerified()}) OR ${stayGuestCapacity} >= ${guests})`;
}
