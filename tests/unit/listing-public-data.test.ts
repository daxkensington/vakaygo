import { expect, it } from "vitest";
import { publicListingTypeData } from "@/lib/listing-public-data";

it("withholds operator contacts while retaining useful public details without mutating source data", () => {
  const original = { phone: "+1 555 0100", email: "owner@example.invalid", website: "https://example.invalid", whatsapp: "+1 555 0100", googleMapsUrl: "https://maps.example.invalid", hours: ["Monday9–5"], amenities: ["pool"], maxGuests: 4 };
  expect(publicListingTypeData(original)).toEqual({ hours: original.hours, amenities: ["pool"], maxGuests: 4 });
  expect(original).toHaveProperty("phone", "+1 555 0100");
});

it("serves only the fields a public page renders, never outreach or import bookkeeping", () => {
  // The shape of a scraped listing as stored in production.
  const stored = {
    hours: ["Mon 9-5"], source: "google-places", unclaimed: true, category: "tourist_attraction",
    googleTypes: ["point_of_interest"], googlePlaceId: "ChIJ-example", emailCheckedAt: "2026-10-15T00:00:00Z",
    instagram: "https://instagram.com/example", facebook: "https://facebook.com/example",
    contactSweep202610: { status: "found" }, contactSweep202610v2: { pages: 3 },
    emailSource: "website_sweep_202610", alternateEmails: ["a@example.invalid", "b@example.invalid"],
    outreachNotes: "left voicemail", tripadvisorUrl: "https://tripadvisor.example.invalid",
  };
  expect(publicListingTypeData(stored)).toEqual({
    hours: ["Mon 9-5"], source: "google-places", unclaimed: true, category: "tourist_attraction",
  });
  expect(JSON.stringify(publicListingTypeData(stored))).not.toMatch(/example\.invalid|Sweep|emailSource|googlePlaceId/);
});

it("keeps every detail the listing page, hubs and concierge read", () => {
  const rendered = {
    cuisineType: "Creole", cuisine: "Creole", cuisines: ["Creole"], serves: ["Dinner"], menu: [{ section: "Mains", items: [] }], priceLevel: "$$",
    amenities: ["pool"], facilities: ["gym"], propertyType: "villa", property_type: "villa", bedrooms: 3, bathrooms: 2, maxGuests: 6,
    includes: ["lunch"], included: ["lunch"], excluded: ["tips"], itinerary: [{ stopNumber: 1 }], duration: "3 hours", durationMinutes: 180,
    isMultiDay: false, meetingPoint: "Pier 1", groupSize: 8, maxGroupSize: 12, languages: ["English"], difficulty: "Easy",
    bookingCount7Days: 4, spotsRemaining: 2, unclaimed: false,
  };
  expect(publicListingTypeData(rendered)).toEqual(rendered);
});

it("publishes a provenance label only when a page needs it to attribute a rating", () => {
  expect(publicListingTypeData({ source: "website_sweep_202610", hours: [] })).toEqual({ hours: [] });
  expect(publicListingTypeData({ source: { nested: true } })).toEqual({});
});

it.each([null, undefined, "not-an-object", 42, ["unexpected-array"]])("does not serialize invalid public type data %j", value => {
  expect(publicListingTypeData(value)).toBeNull();
});
