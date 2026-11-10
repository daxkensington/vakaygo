// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bookingQuantity, bookingSubtotal, isPerBookingUnit, pricedDates } from "@/lib/booking-quantity";
import { calculateBookingPrice } from "@/lib/pricing";

describe("bookingQuantity", () => {
  it("prices vehicle, event, day and hour per booking, not per guest", () => {
    for (const unit of ["vehicle", "event", "day", "hour", "trip", "group", "Day "]) {
      expect(isPerBookingUnit(unit)).toBe(true);
      expect(bookingQuantity({ type: "transport", priceUnit: unit, guestCount: 4 })).toBe(1);
    }
  });
  it("keeps per-guest units and nightly stays", () => {
    for (const unit of ["person", "ticket", "entry", "meal", "session", null]) {
      expect(bookingQuantity({ type: "tour", priceUnit: unit, guestCount: 3 })).toBe(3);
    }
    expect(bookingQuantity({ type: "stay", priceUnit: "night", guestCount: 4, nights: 5 })).toBe(5);
  });
});

describe("bookingSubtotal", () => {
  it("before/after: a 4-guest car rental priced $60 per day costs $60, not $240", () => {
    const priced = bookingSubtotal({ type: "transport", priceUnit: "day", basePrice: 60, guestCount: 4, startDate: "2026-12-01" });
    expect(priced).toMatchObject({ quantity: 1, unitPrice: 60, subtotal: 60, usesOverride: false });
  });
  it("uses a calendar override only on its own date", () => {
    const overrides = { "2026-12-24": "120.00", "2026-01-01": "999" };
    expect(bookingSubtotal({ type: "tour", priceUnit: "person", basePrice: 80, guestCount: 2, startDate: "2026-12-24", overrides }).subtotal).toBe(240);
    expect(bookingSubtotal({ type: "tour", priceUnit: "person", basePrice: 80, guestCount: 2, startDate: "2026-12-23", overrides }).subtotal).toBe(160);
  });
  it("sums nightly prices for a stay, overrides on their nights only", () => {
    const priced = bookingSubtotal({ type: "stay", priceUnit: "night", basePrice: 200, guestCount: 2, startDate: "2026-12-23", endDate: "2026-12-26", overrides: { "2026-12-24": 300, "2026-12-26": 999 } });
    expect(priced).toMatchObject({ quantity: 3, subtotal: 700, usesOverride: true });
    const fees = calculateBookingPrice({ pricePerUnit: priced.unitPrice, quantity: priced.quantity, subtotal: priced.subtotal, listingType: "stay" });
    expect(fees.subtotal).toBe(700);
  });
  it("applies transfer vehicle and trip multipliers to an override", () => {
    const priced = bookingSubtotal({ type: "transfer", priceUnit: "trip", basePrice: 189, guestCount: 3, startDate: "2026-12-01", overrides: { "2026-12-01": 100 }, multiplier: 2.52 });
    expect(priced).toMatchObject({ quantity: 1, subtotal: 252, usesOverride: true });
  });
  it("ignores zero, negative and unreadable overrides", () => {
    for (const bad of [0, -5, "abc", null]) {
      expect(bookingSubtotal({ type: "tour", priceUnit: "person", basePrice: 50, guestCount: 1, startDate: "2026-12-01", overrides: { "2026-12-01": bad } }).subtotal).toBe(50);
    }
  });
  it("lists the priced dates", () => {
    expect(pricedDates("stay", "2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(pricedDates("tour", "2026-12-30T09:00:00")).toEqual(["2026-12-30"]);
  });
});
