import { expect, it } from "vitest";
import { MAP_INITIAL_PAGE_SIZE, MAP_PAGE_SIZE, parseMapListingPage } from "@/lib/map-listings";

const pin = (number: number) => ({ id: `00000000-0000-0000-0000-${number.toString(16).padStart(12, "0")}`, title: `Pin ${number}`, slug: `pin-${number}`, type: "tour", islandSlug: "grenada", islandName: "Grenada", latitude: "12.1", longitude: "-61.7", bookingEligible: false, priceAmount: null, priceCurrency: "USD", priceUnit: "trip", avgRating: null, reviewCount: 0, parish: null, isFeatured: false, image: null });

it("accepts the small initial page and the bounded larger continuation without weakening row validation", () => {
  for (const length of [MAP_INITIAL_PAGE_SIZE, MAP_PAGE_SIZE]) {
    const listings = Array.from({ length }, (_, index) => pin(index + 1));
    expect(parseMapListingPage({ listings, nextCursor: listings.at(-1)!.id, totalCount: 8037 }).listings).toHaveLength(length);
  }
  const listings = Array.from({ length: MAP_PAGE_SIZE }, (_, index) => pin(index + 1));
  expect(() => parseMapListingPage({ listings: [...listings, pin(MAP_PAGE_SIZE + 1)], nextCursor: null, totalCount: null })).toThrow();
  expect(() => parseMapListingPage({ listings: [...listings.slice(0, -1), { ...listings.at(-1), slug: "" }], nextCursor: null, totalCount: null })).toThrow();
  expect(() => parseMapListingPage({ listings: [{ ...pin(1), priceAmount: "350" }], nextCursor: null, totalCount: null })).toThrow();
});
