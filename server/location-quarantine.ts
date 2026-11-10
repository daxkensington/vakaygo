import { and, eq, not, or, sql } from "drizzle-orm";
import { listings } from "@/drizzle/schema";
import manifest from "@/server/data/location-quarantine.json";
import { hasSyntheticGridSignature } from "@/lib/listing-import-guards";

type Location = {
  id: string;
  latitude: string | number | null | undefined;
  longitude: string | number | null | undefined;
};

const observed = new Map(manifest.entries.map(entry => [entry.id, {
  latitude: Number(entry.latitude), longitude: Number(entry.longitude),
}]));

/** Withhold only an observed suspect point, never a corrected coordinate or another record. */
export function isQuarantinedLocation(location: Location): boolean {
  if (location.latitude == null || location.longitude == null) return false;
  // A point on the synthetic import grid is never a real location, listed or not.
  if (hasSyntheticGridSignature(location.latitude, location.longitude)) return true;
  const original = observed.get(location.id.toLowerCase());
  return original !== undefined
    && Number(location.latitude) === original.latitude
    && Number(location.longitude) === original.longitude;
}

/** Applied before map pagination and counting, so omitted points do not create missing pages. */
export function excludeQuarantinedLocations() {
  const suspect = or(...manifest.entries.map(entry => and(
    eq(listings.id, entry.id),
    eq(listings.latitude, entry.latitude),
    eq(listings.longitude, entry.longitude),
  )));
  // Same signature as hasSyntheticGridSignature; NULL coordinates are not suspect.
  const grid = sql`coalesce(${listings.latitude}::text ~ '\\.\\d{4}(452|952)$' AND ${listings.longitude}::text ~ '\\.\\d{4}(145|645)$', false)`;
  return suspect ? and(not(suspect), not(grid))! : not(grid);
}
