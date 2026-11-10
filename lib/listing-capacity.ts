export const LEGACY_STAY_CAPACITY_PATTERN = "^[1-9][0-9]{0,2}$";
const legacyCapacity = new RegExp(LEGACY_STAY_CAPACITY_PATTERN);

/** Offered when a listing states no capacity. */
export const DEFAULT_GUEST_CHOICES = 8;
/** A select longer than this is unusable; larger groups contact the business. */
export const MAX_GUEST_CHOICES = 100;

/** 1…capacity for the booking widget's guest picker; 1…8 when capacity is unknown. */
export function guestCountOptions(capacity: number | null | undefined): number[] {
  const limit = typeof capacity === "number" && Number.isSafeInteger(capacity) && capacity > 0
    ? Math.min(capacity, MAX_GUEST_CHOICES)
    : DEFAULT_GUEST_CHOICES;
  return Array.from({ length: limit }, (_, index) => index + 1);
}

/**
 * Capacity a visitor may be shown as a fact. Imported listings carry a
 * type default (8 for tours and restaurants, 4 for stays, 2 for spas) that
 * no business ever stated, so only a business that verified its ownership
 * gets an "Up to N guests" line.
 */
export function displayedGuestCapacity(claimVerified: boolean | null | undefined, maxGuests: number | null | undefined, legacy: unknown): number | null {
  return claimVerified === true ? resolveListingGuestCapacity(maxGuests, legacy) : null;
}

/** `YYYY-MM-DD` for a date input, in the viewer's own calendar (not UTC). */
export function localDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Operator capacity wins even when stale imported JSON disagrees. */
export function resolveListingGuestCapacity(maxGuests: number | null | undefined, legacy: unknown): number | null {
  if (maxGuests != null) return Number.isSafeInteger(maxGuests) && maxGuests > 0 ? maxGuests : null;
  if (typeof legacy !== "string" && typeof legacy !== "number") return null;
  return legacyCapacity.test(String(legacy)) ? Number(legacy) : null;
}
