/**
 * How many priced units a booking is, and what it costs before fees.
 *
 * Shared by the booking API, the booking widget and (in SQL) the
 * `vakaygo_booking_guard` trigger (migration 0023). Change all three together.
 *
 * - Stays are priced per night.
 * - A price per trip, group, vehicle, event, day or hour is a price for the
 *   booking as a whole: the widget books one date and collects no duration,
 *   so the booking is one unit. (Before, vehicle/event/day/hour prices were
 *   multiplied by the number of guests.)
 * - Everything else (person, ticket, entry, meal, session) is per guest.
 * - A calendar price override replaces the listing price on the date it is
 *   set for. Overrides on other dates do not affect the booking.
 */

/** Price units that price the whole booking, not each guest. */
export const PER_BOOKING_PRICE_UNITS = ["trip", "group", "vehicle", "event", "day", "hour"] as const;

export function isPerBookingUnit(priceUnit: string | null | undefined): boolean {
  return (PER_BOOKING_PRICE_UNITS as readonly string[]).includes((priceUnit || "").trim().toLowerCase());
}

export function bookingQuantity(input: { type: string; priceUnit: string | null | undefined; guestCount: number; nights?: number | null }): number {
  if (input.type === "stay") return Math.max(1, Math.floor(input.nights ?? 1));
  if (isPerBookingUnit(input.priceUnit)) return 1;
  return Math.max(1, Math.floor(input.guestCount));
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** The dates a booking is priced on: each night of a stay, otherwise the start date. YYYY-MM-DD. */
export function pricedDates(type: string, startDate: string, endDate?: string | null): string[] {
  const start = startDate.slice(0, 10);
  if (type !== "stay" || !endDate) return [start];
  const out: string[] = [];
  const end = endDate.slice(0, 10);
  for (let day = new Date(`${start}T00:00:00Z`); day.toISOString().slice(0, 10) < end && out.length < 366; day = new Date(day.getTime() + 86_400_000)) {
    out.push(day.toISOString().slice(0, 10));
  }
  return out.length ? out : [start];
}

export type BookingSubtotal = {
  quantity: number;
  /** The price of one unit; for a stay with mixed nightly prices, the average night. */
  unitPrice: number;
  subtotal: number;
  /** True when at least one booked date uses a calendar price override. */
  usesOverride: boolean;
};

/**
 * @param basePrice listing price (already multiplied for transfer options)
 * @param overrides YYYY-MM-DD -> override price (only positive values count)
 * @param multiplier applied to override prices too (transfer vehicle / round trip)
 */
export function bookingSubtotal(input: {
  type: string;
  priceUnit: string | null | undefined;
  basePrice: number;
  guestCount: number;
  startDate: string;
  endDate?: string | null;
  overrides?: Record<string, number | string | null | undefined>;
  multiplier?: number;
}): BookingSubtotal {
  const multiplier = input.multiplier ?? 1;
  const dates = pricedDates(input.type, input.startDate, input.endDate);
  const priceOn = (date: string) => {
    const raw = input.overrides?.[date];
    const value = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? { price: cents(value * multiplier), override: true } : { price: input.basePrice, override: false };
  };
  if (input.type === "stay") {
    const nights = dates.map(priceOn);
    const subtotal = cents(nights.reduce((sum, night) => sum + night.price, 0));
    return { quantity: nights.length, unitPrice: cents(subtotal / nights.length), subtotal, usesOverride: nights.some(n => n.override) };
  }
  const quantity = bookingQuantity({ type: input.type, priceUnit: input.priceUnit, guestCount: input.guestCount });
  const day = priceOn(dates[0]);
  return { quantity, unitPrice: day.price, subtotal: cents(day.price * quantity), usesOverride: day.override };
}
