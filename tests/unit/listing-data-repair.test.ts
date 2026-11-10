// @vitest-environment node
import { describe, expect, it } from "vitest";
import { closedBusinessAction, hasSyntheticGridSignature, PlaceIdRegistry } from "@/lib/listing-import-guards";
import { isGeneratedImage, listingStructuredData } from "@/lib/listing-structured-data";
import { isQuarantinedLocation } from "@/server/location-quarantine";
import { redirectLocation } from "@/server/listing-redirects";
import { nameOverlap, sameBusinessName } from "../../scripts/repair/_lib.mjs";

describe("synthetic coordinate grid", () => {
  it("matches the imported Bonaire grid and nothing else", () => {
    expect(hasSyntheticGridSignature("12.2801952", "-68.3784145")).toBe(true);
    expect(hasSyntheticGridSignature("12.2755452", "-68.3815645")).toBe(true);
    expect(hasSyntheticGridSignature(12.2698452, -68.3725645)).toBe(true);
    expect(hasSyntheticGridSignature("12.1504320", "-68.2771003")).toBe(false);
    expect(hasSyntheticGridSignature("12.2801952", "-68.3784140")).toBe(false);
    expect(hasSyntheticGridSignature(null, "-68.3784145")).toBe(false);
  });
  it("withholds grid points even when they are not in the manifest", () => {
    expect(isQuarantinedLocation({ id: "00000000-0000-4000-8000-000000000001", latitude: "12.2801952", longitude: "-68.3784145" })).toBe(true);
    expect(isQuarantinedLocation({ id: "00000000-0000-4000-8000-000000000001", latitude: "12.1504320", longitude: "-68.2771003" })).toBe(false);
  });
  it("lists the 24 Bonaire grid points in the manifest", async () => {
    const manifest = (await import("@/server/data/location-quarantine.json")).default as { entries: { latitude: string; longitude: string }[] };
    expect(manifest.entries.filter((e) => hasSyntheticGridSignature(e.latitude, e.longitude))).toHaveLength(24);
  });
});

describe("place ID registry", () => {
  it("lets a place ID onto one listing per destination and type", () => {
    const registry = new PlaceIdRegistry([{ islandId: 1, type: "stay", placeId: "ChIJ-a" }]);
    expect(registry.claim({ islandId: 1, type: "stay", placeId: "ChIJ-a" })).toBe(false);
    expect(registry.claim({ islandId: 1, type: "dining", placeId: "ChIJ-a" })).toBe(true);
    expect(registry.claim({ islandId: 2, type: "stay", placeId: "ChIJ-a" })).toBe(true);
    expect(registry.claim({ islandId: 2, type: "stay", placeId: "ChIJ-a" })).toBe(false);
    expect(registry.claim({ islandId: 2, type: "stay", placeId: "" })).toBe(true);
  });
});

describe("closed businesses", () => {
  it("pauses only an unclaimed listing Google reports permanently closed", () => {
    expect(closedBusinessAction("CLOSED_PERMANENTLY", true)).toEqual({ reason: "closed_permanently" });
    expect(closedBusinessAction("CLOSED_PERMANENTLY", false)).toBeNull();
    expect(closedBusinessAction("CLOSED_TEMPORARILY", true)).toBeNull();
    expect(closedBusinessAction("OPERATIONAL", true)).toBeNull();
    expect(closedBusinessAction(undefined, true)).toBeNull();
  });
});

describe("same-business names (shared place ID repair)", () => {
  it("recognises the same business written differently", () => {
    expect(sameBusinessName("Amsterdam Manor Beach Resort", "Amsterdam Manor Beach Resort Aruba", "Aruba")).toBe(true);
    expect(sameBusinessName("Spring Gardens Resort", "Spring Garden Resort", "Jamaica")).toBe(true);
    expect(sameBusinessName("Eco Dive, Grenada Blue", "EcoDive Grenada", "Grenada")).toBe(true);
    expect(sameBusinessName("SunTours Barbados", "Sun Tours Barbados", "Barbados")).toBe(true);
    expect(sameBusinessName("Jamaica Tours Ltd", "Jamaica Tours Limited", "Jamaica")).toBe(true);
    expect(sameBusinessName("Shadowfax Catamaran", "Shadowfax Charters (Grenada)", "Grenada")).toBe(true);
    expect(sameBusinessName("St. Lucia Helicopters Transfer", "Saint Lucia Helicopters", "St. Lucia")).toBe(true);
  });
  it("keeps different businesses apart even when they share generic or place words", () => {
    expect(sameBusinessName("Capella Marigot Bay", "Zoëtry Marigot Bay St. Lucia", "St. Lucia")).toBe(false);
    expect(sameBusinessName("The Moorings: Grenada Yacht Charters", "Footloose Yacht Charters", "Grenada")).toBe(false);
    expect(sameBusinessName("Hidden Treasures Tours", "Mandoo Tours", "Grenada")).toBe(false);
    expect(sameBusinessName("Goyaba Beach House", "Coyaba Beach Resort", "Grenada")).toBe(false);
    expect(sameBusinessName("The Big Dipper Restaurant & Bar", "De Big Fish", "Grenada")).toBe(false);
    expect(nameOverlap("Mandoo Tours", "Mandoo Tours", "Grenada")).toBe(1);
  });
});

describe("removed listing URLs", () => {
  it("sends a merged or moved listing permanently and a paused one temporarily", () => {
    expect(redirectLocation({ kind: "alias", island: "aruba", slug: "amsterdam-manor-beach-resort-aruba" })).toEqual({ location: "/aruba/amsterdam-manor-beach-resort-aruba", permanent: true });
    expect(redirectLocation({ kind: "inactive", island: "grenada", slug: "anything" })).toEqual({ location: "/grenada", permanent: false });
    expect(redirectLocation(undefined)).toBeNull();
    expect(redirectLocation({ kind: "alias", island: "aruba", slug: "//evil.example" })).toBeNull();
    expect(redirectLocation({ kind: "alias", island: "../x", slug: "a" })).toBeNull();
  });
});

describe("generated images", () => {
  it("are recognised and kept out of structured data", () => {
    expect(isGeneratedImage("/images/generated/a-e-tours-grenada-6ece3c40.jpg")).toBe(true);
    expect(isGeneratedImage("https://vakaygo.com/images/generated/x.jpg")).toBe(true);
    expect(isGeneratedImage("https://md5ccwdrtwgglaeh.public.blob.vercel-storage.com/a.jpg")).toBe(false);
    const data = listingStructuredData({
      title: "A&E Tours", slug: "a-e-tours-grenada", type: "tour", description: null, address: null, parish: null,
      islandSlug: "grenada", islandName: "Grenada", islandCountry: "Grenada", latitude: null, longitude: null, typeData: null,
      images: [{ url: "/images/generated/a-e-tours-grenada-6ece3c40.jpg" }, { url: "https://md5ccwdrtwgglaeh.public.blob.vercel-storage.com/a.jpg" }],
    }) as unknown as { image?: string[] } | { "@graph": { image?: string[] }[] };
    expect(JSON.stringify(data)).not.toContain("/images/generated/");
    expect(JSON.stringify(data)).toContain("blob.vercel-storage.com/a.jpg");
  });
});
