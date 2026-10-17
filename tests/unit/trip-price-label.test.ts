import { expect, it } from "vitest";
import { tripPriceLabel } from "@/lib/trip-price-label";

const listing = { bookingEligible: true, priceAmount: "135.00", priceCurrency: "XCD", priceUnit: "person" };
it("preserves the recorded currency and unit for a currently eligible saved-trip listing", () => {
  expect(tripPriceLabel(listing)?.replace(/\s/g, "")).toBe("XCD135.00/person");
  expect(tripPriceLabel({ ...listing, priceCurrency: "USD", priceAmount: "50.50", priceUnit: null })?.replace(/\s/g, "")).toBe("USD50.50");
});
it.each([
  { bookingEligible: false }, { bookingEligible: undefined }, { priceAmount: null },
  { priceAmount: "25USD" }, { priceAmount: "Infinity" }, { priceAmount: "0" }, { priceAmount: "-5" },
  { priceCurrency: null }, { priceCurrency: "ZZZ" },
])("does not imply an admission price for unconfirmed or invalid saved-trip money: %j", overrides => {
  expect(tripPriceLabel({ ...listing, ...overrides })).toBeNull();
});
