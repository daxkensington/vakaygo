import { and, eq, gte, lte } from "drizzle-orm";
import { islands, listings } from "@/drizzle/schema";
import { publicDirectoryListings } from "@/server/public-listing-eligibility";
import { excludeQuarantinedLocations } from "@/server/location-quarantine";

/** Public pins need usable listing links, including when old imports have blank slugs. */
export function publicMapLocations(island: string | null) {
  return and(
    publicDirectoryListings(),
    gte(listings.latitude, "-90"), lte(listings.latitude, "90"),
    gte(listings.longitude, "-180"), lte(listings.longitude, "180"),
    excludeQuarantinedLocations(),
    island ? eq(islands.slug, island) : undefined,
  );
}
