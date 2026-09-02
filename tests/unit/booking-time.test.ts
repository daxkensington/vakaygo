import { describe, it, expect } from "vitest";
import {
  toWallClockDate,
  formatBookingDate,
  formatBookingTime,
  formatBookingDateTime,
  hasBookingTime,
} from "@/lib/booking-time";

/**
 * The dispute that motivated this: a traveler picked 12:00 for a Nassau
 * restaurant, the voucher rendered it in her own zone, and she saw 5:00 am.
 * Booking times are wall-clock values — the digits typed must be the digits
 * shown, no matter where the server or the viewer is.
 */
describe("booking-time", () => {
  it("pins a zoneless date-time string to its own digits", () => {
    const d = toWallClockDate("2026-11-17T12:00:00");
    expect(d.toISOString()).toBe("2026-11-17T12:00:00.000Z");
  });

  it("pins a date-only string to midnight of that date", () => {
    const d = toWallClockDate("2026-08-22");
    expect(d.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("leaves an explicit-zone string alone", () => {
    const d = toWallClockDate("2026-11-17T12:00:00-04:00");
    expect(d.toISOString()).toBe("2026-11-17T16:00:00.000Z");
  });

  it("renders the typed time regardless of the process timezone", () => {
    // The API serialises the stored wall-clock as ...Z; rendering must not
    // apply the viewer's offset.
    expect(formatBookingTime("2026-11-17T12:00:00.000Z")).toBe("12:00 PM");
    expect(formatBookingDate("2026-11-17T12:00:00.000Z")).toBe("Tue, Nov 17, 2026");
    expect(formatBookingDateTime("2026-11-17T12:00:00.000Z")).toBe("Tue, Nov 17, 2026 at 12:00 PM");
  });

  it("does not invent a midnight time for date-only bookings", () => {
    expect(hasBookingTime("2026-08-22T00:00:00.000Z")).toBe(false);
    expect(formatBookingDateTime("2026-08-22T00:00:00.000Z")).toBe("Sat, Aug 22, 2026");
    // A date-only booking must never slide to the previous day for a viewer west of UTC.
    expect(formatBookingDate("2026-08-22")).toBe("Sat, Aug 22, 2026");
  });

  it("round-trips a widget value through store-and-render unchanged", () => {
    const typed = "2026-11-17T12:00:00";
    const stored = toWallClockDate(typed);
    expect(formatBookingDateTime(stored.toISOString())).toBe("Tue, Nov 17, 2026 at 12:00 PM");
  });
});
