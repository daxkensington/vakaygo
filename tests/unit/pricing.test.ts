import { describe, it, expect } from "vitest";
import {
  calculateBookingPrice,
  formatCurrency,
  CATEGORY_RATES,
} from "@/lib/pricing";

describe("calculateBookingPrice", () => {
  it("applies tour rates to a 100 x 2 booking", () => {
    const result = calculateBookingPrice({
      pricePerUnit: 100,
      quantity: 2,
      listingType: "tour",
    });
    const rates = CATEGORY_RATES.tour;

    expect(result.subtotal).toBe(200);
    expect(result.serviceFee).toBe(200 * rates.travelerFee);
    expect(result.operatorCommission).toBe(200 * rates.operatorFee);
    expect(result.total).toBe(result.subtotal + result.serviceFee);
    expect(result.operatorEarnings).toBe(result.subtotal - result.operatorCommission);
  });

  it("falls back to tour rates for unknown listingType", () => {
    const a = calculateBookingPrice({
      pricePerUnit: 50,
      quantity: 1,
      listingType: "definitely-not-a-category",
    });
    const b = calculateBookingPrice({
      pricePerUnit: 50,
      quantity: 1,
      listingType: "tour",
    });
    expect(a.serviceFee).toBe(b.serviceFee);
    expect(a.operatorCommission).toBe(b.operatorCommission);
  });

  it("adds insurance fee + platform share when requested", () => {
    const noIns = calculateBookingPrice({
      pricePerUnit: 100,
      quantity: 1,
      listingType: "stay",
    });
    const withIns = calculateBookingPrice({
      pricePerUnit: 100,
      quantity: 1,
      listingType: "stay",
      includeInsurance: true,
    });

    expect(withIns.insuranceFee).not.toBeNull();
    expect(withIns.total).toBeGreaterThan(noIns.total);
    expect(withIns.platformRevenue).toBeGreaterThan(noIns.platformRevenue);
  });

  it("dining has zero booking fees", () => {
    const r = calculateBookingPrice({
      pricePerUnit: 80,
      quantity: 4,
      listingType: "dining",
    });
    expect(r.serviceFee).toBe(0);
    expect(r.operatorCommission).toBe(0);
    expect(r.total).toBe(r.subtotal);
  });
});

describe("formatCurrency", () => {
  it("formats USD by default", () => {
    expect(formatCurrency(1234.5)).toMatch(/\$1,234\.50/);
  });
});
