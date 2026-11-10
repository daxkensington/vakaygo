/**
 * Checks shared by the listing import and enrichment scripts and the enrich
 * cron, so the data problems repaired by scripts/repair/ cannot come back:
 * - a Google place ID belongs to one listing per destination and type;
 * - a point on the synthetic coordinate grid is not a real location;
 * - a business Google reports as permanently closed is paused, not listed.
 */

/** The synthetic grid seen on imported Bonaire hotels: latitudes end ...452/...952, longitudes ...145/...645. */
export function hasSyntheticGridSignature(latitude: string | number | null | undefined, longitude: string | number | null | undefined): boolean {
  if (latitude == null || longitude == null) return false;
  const lat = typeof latitude === "number" ? latitude.toFixed(7) : String(latitude).trim();
  const lng = typeof longitude === "number" ? longitude.toFixed(7) : String(longitude).trim();
  return /\.\d{4}(452|952)$/.test(lat) && /\.\d{4}(145|645)$/.test(lng);
}

export type PlaceKey = { islandId: number; type: string; placeId: string };

/** Key under which a place ID may appear only once. */
export function placeKey(key: PlaceKey): string {
  return `${key.islandId}|${key.type}|${key.placeId.trim()}`;
}

/**
 * Tracks place IDs already used in an import run plus those already in the
 * database (load them with `SELECT island_id, type, coalesce(type_data->>'googlePlaceId',
 * type_data->>'placeId') FROM listings WHERE status='active'`). `claim` returns
 * false when the place is taken, and the caller must not attach it.
 */
export class PlaceIdRegistry {
  private readonly used = new Set<string>();
  constructor(existing: Iterable<PlaceKey> = []) {
    for (const key of existing) if (key.placeId) this.used.add(placeKey(key));
  }
  claim(key: PlaceKey): boolean {
    if (!key.placeId?.trim()) return true;
    const id = placeKey(key);
    if (this.used.has(id)) return false;
    this.used.add(id);
    return true;
  }
}

/**
 * What to do with a listing given Google's business_status. Only an
 * unclaimed directory record is paused automatically; a claimed business is
 * left to its owner.
 */
export function closedBusinessAction(businessStatus: string | null | undefined, unclaimed: boolean): { reason: "closed_permanently" } | null {
  return businessStatus === "CLOSED_PERMANENTLY" && unclaimed ? { reason: "closed_permanently" } : null;
}
