export type PlaceSearchArea = { latitude: number; longitude: number; radiusMeters: number };

function coordinate(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= maximum ? number : null;
}

/** Database centers may be numeric strings; missing or malformed centers fail closed. */
export function placeSearchArea(latitude: unknown, longitude: unknown, radiusMeters: number): PlaceSearchArea | null {
  const lat = coordinate(latitude, 90), lng = coordinate(longitude, 180);
  if (lat === null || lng === null || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return null;
  return { latitude: lat, longitude: lng, radiusMeters };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Google Text Search location/radius only biases results. Treat that same circle
 * as a strict import boundary before assigning the queried destination.
 * This is not a country polygon: wider coverage needs separately planned centers.
 */
export function placeWithinSearchArea(place: unknown, area: PlaceSearchArea): boolean {
  if (!placeSearchArea(area.latitude, area.longitude, area.radiusMeters)
    || !record(place) || !record(place.geometry) || !record(place.geometry.location)) return false;
  const { lat, lng } = place.geometry.location;
  // Provider geometry must contain actual finite numbers, not coerced strings.
  if (typeof lat !== "number" || typeof lng !== "number" || coordinate(lat, 90) === null || coordinate(lng, 180) === null) return false;
  const radians = Math.PI / 180;
  const dLat = (lat - area.latitude) * radians, dLng = (lng - area.longitude) * radians;
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(area.latitude * radians) * Math.cos(lat * radians) * Math.sin(dLng / 2) ** 2;
  const clamped = Math.max(0, Math.min(1, haversine));
  const distance = 6_371_000 * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return distance <= area.radiusMeters;
}
