import { describe, expect, it } from "vitest";
import { listingStructuredData, serializeJsonLd, safeWebUrl, type StructuredListing } from "@/lib/listing-structured-data";
const listing: StructuredListing = { title: "A local business", slug: "business", type: "dining", description: "A real description", address: "12 Seafront Road", parish: "St George", islandSlug: "barbados", islandName: "Barbados", islandCountry: "Barbados", latitude: "0", longitude: "-59.5", typeData: { phone: "+12465550000", website: "https://business.example", cuisineType: "Caribbean", unclaimed: true, source: "google-places" }, images: [{ url: "/business.jpg", type: "image" }, { url: "/tour.mp4", type: "video" }] };
describe("server-rendered directory structured data", () => {
  it("uses the destination country and actual address, including valid zero coordinates", () => {
    const entity = listingStructuredData(listing)["@graph"][0];
    expect(entity).toMatchObject({ "@type": "Restaurant", address: { streetAddress: listing.address, addressCountry: "Barbados" }, geo: { latitude: 0, longitude: -59.5 }, servesCuisine: "Caribbean", image: ["https://vakaygo.com/business.jpg"] });
    expect(entity).not.toHaveProperty("offers"); expect(entity).not.toHaveProperty("aggregateRating"); expect(entity).not.toHaveProperty("potentialAction");
  });
  it("never invents an event schedule, price, rating, coordinates or availability", () => {
    const data = listingStructuredData({ ...listing, type: "event", latitude: "91", longitude: "bad", typeData: { avgRating: 5, unclaimed: false } });
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/"Event"|startDate|offers|InStock|aggregateRating|GeoCoordinates/);
  });
  it("escapes closing-script injection while keeping the JSON data intact", () => {
    const value = { name: "</script><script>alert(1)</script>" };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain("<"); expect(JSON.parse(serialized)).toEqual(value);
  });
  it("rejects executable URLs and embedded credentials", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hello", "https://user:secret@example.com", null]) expect(safeWebUrl(url)).toBeUndefined();
  });
});
