/**
 * Booking times are WALL-CLOCK times at the listing's location, not instants.
 *
 * The widgets send "2026-11-17T12:00:00" (no zone) or "2026-08-22" (date only).
 * We store that wall-clock value in a naive `timestamp` column, and the API
 * serialises it back as "2026-11-17T12:00:00.000Z". If a browser renders that
 * with the default (viewer's) zone, a 12:00 reservation in Nassau shows as
 * 5:00 am to a traveler in California — which is exactly the dispute we got.
 *
 * Rule: parse with `toWallClockDate`, and ALWAYS format with `timeZone: "UTC"`
 * so the digits the traveler typed are the digits everyone sees.
 */

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Normalise a widget-supplied date/date-time string into a Date whose UTC
 *  fields equal the wall-clock fields the traveler entered. */
export function toWallClockDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) return new Date(`${s}Z`);
  if (HAS_ZONE.test(s)) return new Date(s);
  return new Date(s);
}

function asDate(v: string | Date): Date {
  return v instanceof Date ? v : toWallClockDate(v);
}

/** "Tue, Nov 17, 2026" */
export function formatBookingDate(
  v: string | Date,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }
): string {
  return asDate(v).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** "12:00 PM" */
export function formatBookingTime(v: string | Date): string {
  return asDate(v).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

/** Date-only bookings are stored at 00:00 — don't render a meaningless midnight. */
export function hasBookingTime(v: string | Date): boolean {
  const d = asDate(v);
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
}

/** "Tue, Nov 17, 2026 at 12:00 PM" (or just the date). */
export function formatBookingDateTime(v: string | Date): string {
  return hasBookingTime(v)
    ? `${formatBookingDate(v)} at ${formatBookingTime(v)}`
    : formatBookingDate(v);
}
