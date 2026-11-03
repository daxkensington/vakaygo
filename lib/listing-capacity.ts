export const LEGACY_STAY_CAPACITY_PATTERN = "^[1-9][0-9]{0,2}$";
const legacyCapacity = new RegExp(LEGACY_STAY_CAPACITY_PATTERN);

/** Operator capacity wins even when stale imported JSON disagrees. */
export function resolveListingGuestCapacity(maxGuests: number | null | undefined, legacy: unknown): number | null {
  if (maxGuests != null) return Number.isSafeInteger(maxGuests) && maxGuests > 0 ? maxGuests : null;
  if (typeof legacy !== "string" && typeof legacy !== "number") return null;
  return legacyCapacity.test(String(legacy)) ? Number(legacy) : null;
}
