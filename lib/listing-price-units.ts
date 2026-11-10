/**
 * Price units a listing can be booked with. This is the list in the database
 * rule `vakaygo_listing_setup_valid` (migration 0006): a listing whose unit is
 * missing or not on it can never open for bookings, so the operator forms
 * offer nothing else and the listing APIs refuse anything else.
 */
export const BOOKABLE_PRICE_UNITS = [
  "night", "person", "group", "hour", "day", "trip", "vehicle", "event", "session", "meal", "entry", "ticket",
] as const;
export type BookablePriceUnit = (typeof BOOKABLE_PRICE_UNITS)[number];

const BOOKABLE = new Set<string>(BOOKABLE_PRICE_UNITS);

export function isBookablePriceUnit(value: unknown): value is BookablePriceUnit {
  return typeof value === "string" && BOOKABLE.has(value);
}

/** Units offered for each listing type, most common first. Every entry is bookable. */
export const PRICE_UNITS_BY_TYPE: Record<string, readonly BookablePriceUnit[]> = {
  stay: ["night"],
  excursion: ["person", "group", "trip"],
  tour: ["person", "group"],
  dining: ["meal", "person"],
  event: ["ticket", "event", "person"],
  transfer: ["trip", "person", "vehicle"],
  transport: ["trip", "day", "person"],
  vip: ["hour", "day", "person", "event"],
  guide: ["person", "hour", "group", "day"],
  spa: ["session", "person", "hour"],
};

export function priceUnitsForType(type: string | null | undefined): readonly BookablePriceUnit[] {
  return (type && PRICE_UNITS_BY_TYPE[type]) || BOOKABLE_PRICE_UNITS;
}

export function priceUnitLabel(unit: string): string {
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

/** What a listing form still has to fill in before the listing can take bookings (dates are set in the calendar). */
export function bookingFieldGaps(fields: { price: string | number | null | undefined; unit: string | null | undefined; maxGuests: string | number | null | undefined; policy: string | null | undefined }): string[] {
  const gaps: string[] = [];
  if (!(Number(fields.price) > 0)) gaps.push("a price");
  if (!isBookablePriceUnit(fields.unit)) gaps.push("what the price is per");
  if (!(Number(fields.maxGuests) > 0)) gaps.push("maximum guests");
  if (!["flexible", "moderate", "strict", "non_refundable"].includes(String(fields.policy || ""))) gaps.push("a cancellation policy");
  return gaps;
}
