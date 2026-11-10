/**
 * What becomes of a booking REQUEST that nobody answered.
 *
 * A `requested` booking is a traveler asking an unbookable listing for a date.
 * Nothing is paid and nothing is held. Until November 2026 nothing ever closed
 * one: requests for dates long past still told the traveler "we're confirming
 * with the business". Once the requested start date has passed the request can
 * no longer be confirmed, so it expires and the traveler is told so.
 *
 * Pure: the cron (app/api/cron/abandoned-bookings), the one-off script
 * (scripts/expire-stale-booking-requests.mjs) and the traveler's bookings page
 * all read their answer from here.
 */

/** Feature flag that lets the cron close expired requests. Absent or off = display only. */
export const REQUEST_EXPIRY_FLAG = "booking_request_expiry_enabled";

export type RequestedBookingFacts = {
  status: string;
  paidAt: Date | string | null;
  startDate: Date | string;
};

export type RequestVerdict = "open" | "expired" | "ignore";

function time(value: Date | string | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  return Number.NaN;
}

export function classifyRequestedBooking(b: RequestedBookingFacts, now: Date = new Date()): RequestVerdict {
  // Anything paid, confirmed, cancelled or completed belongs to another process.
  if (b.status !== "requested" || b.paidAt) return "ignore";
  const start = time(b.startDate);
  if (!Number.isFinite(start)) return "ignore";
  return start <= now.getTime() ? "expired" : "open";
}

export function requestExpiryReason(): string {
  return "Request expired — the business did not confirm before the requested date";
}

/** Status chip and line shown to the traveler for a request, by verdict. */
export function requestStatusCopy(verdict: RequestVerdict): { label: string; detail: string } | null {
  if (verdict === "expired") {
    return {
      label: "Not confirmed",
      detail: "The business did not confirm this request before the date passed. You were not charged.",
    };
  }
  if (verdict === "open") {
    return {
      label: "Request sent",
      detail: "This is a request, not a reservation. The business has not confirmed it. Nothing has been charged.",
    };
  }
  return null;
}
