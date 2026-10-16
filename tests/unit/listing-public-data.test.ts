import { expect, it } from "vitest";
import { publicListingTypeData } from "@/lib/listing-public-data";

it("withholds operator contacts while retaining useful public details without mutating source data", () => {
  const original = { phone: "+1 555 0100", email: "owner@example.invalid", website: "https://example.invalid", whatsapp: "+1 555 0100", googleMapsUrl: "https://maps.example.invalid", hours: ["Monday9–5"], amenities: ["pool"], maxGuests: 4 };
  expect(publicListingTypeData(original)).toEqual({ hours: original.hours, amenities: ["pool"], maxGuests: 4 });
  expect(original).toHaveProperty("phone", "+1 555 0100");
});

it.each([null, undefined, "not-an-object", 42, ["unexpected-array"]])("does not serialize invalid public type data %j", value => {
  expect(publicListingTypeData(value)).toBeNull();
});
