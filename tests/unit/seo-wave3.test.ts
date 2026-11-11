// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildListingTitle, cleanLocationLabel, listingTitleHook, placeKey, stripTemplatedDescription } from "@/lib/listing-seo";
import { exploreFacetOwnedByHub, EXPLORE_SEO_LABELS } from "@/lib/listing-filters";
import { staticPageMetadata } from "@/lib/page-metadata";
import { destinationStructuredData } from "@/lib/destination-structured-data";
import { breadcrumbName } from "@/components/ui/breadcrumbs";
import robots from "@/app/robots";

describe("listing titles", () => {
  it("never repeats the destination under another spelling", () => {
    expect(placeKey("St. Lucia")).toBe(placeKey("St Lucia"));
    expect(placeKey("Saint Kitts & Nevis")).toBe(placeKey("St Kitts and Nevis"));
    expect(placeKey("Curaçao")).toBe(placeKey("Curacao"));
    expect(cleanLocationLabel("St. Lucia", "St Lucia")).toBe("St Lucia");
    expect(cleanLocationLabel("St Kitts & Nevis", "St. Kitts & Nevis")).toBe("St. Kitts & Nevis");
    expect(cleanLocationLabel("St. Vincent & the Grenadines", "St Vincent and the Grenadines")).toBe("St Vincent and the Grenadines");
    expect(cleanLocationLabel("and Barbuda, Antigua & Barbuda", "Antigua & Barbuda")).toBe("Antigua & Barbuda");
    expect(cleanLocationLabel("Roseau, Dominica", "Dominica")).toBe("Roseau, Dominica");
    expect(cleanLocationLabel(null, "Grenada")).toBe("Grenada");
  });
  it("promises a menu only when there is one, and never reviews", () => {
    expect(listingTitleHook("dining", { hasMenu: true })).toBe("Menu, Hours & Location");
    expect(listingTitleHook("dining")).not.toMatch(/Menu/);
    for (const type of ["stay", "tour", "excursion", "spa", "transport", "transfer", "vip", "event", "guide", "dining", "unknown"]) {
      expect(listingTitleHook(type)).not.toMatch(/Review/);
    }
  });
  it("keeps the business name first and stays near 65 characters", () => {
    expect(buildListingTitle("Dive Grenada", "St George's, Grenada", "Tour Details & Photos")).toBe("Dive Grenada (St George's, Grenada) — Tour Details & Photos");
    const townDining = buildListingTitle("Twin Brothers Seafood", "Nassau, The Bahamas", "Menu, Hours & Location");
    expect(townDining).toBe("Twin Brothers Seafood (Nassau, The Bahamas) — Menu & Hours");
    expect(townDining.length).toBeLessThanOrEqual(65);
    const townSpa = buildListingTitle("Anytime Wellness Ltd.", "George Town, Cayman Islands", "Services, Hours & Location");
    expect(townSpa).toBe("Anytime Wellness Ltd. (Cayman Islands) — Services & Hours");
    expect(townSpa.length).toBeLessThanOrEqual(65);
    const long = buildListingTitle("Bungalow on the Beach", "St Vincent and the Grenadines", "Photos, Amenities & Location");
    expect(long).toBe("Bungalow on the Beach, St Vincent and the Grenadines");
    expect(long.length).toBeLessThanOrEqual(65);
    const huge = "A".repeat(80);
    expect(buildListingTitle(huge, "Grenada", "Tour Details & Photos")).toBe(huge);
  });
});

describe("templated listing descriptions", () => {
  it("removes the restated Google rating and the claim pitch, and keeps the rest", () => {
    const text = "Dive Grenada runs reef and wreck dives from Grand Anse. Highly regarded by visitors with a 4.8/5 rating across 1,204 reviews. It is a convenient choice for guests exploring Grenada. Claim this listing on VakayGo to manage availability, photos, and direct bookings with 0% guest fees.";
    expect(stripTemplatedDescription(text)).toBe("Dive Grenada runs reef and wreck dives from Grand Anse. It is a convenient choice for guests exploring Grenada.");
    expect(stripTemplatedDescription("Written by the owner.")).toBe("Written by the owner.");
    expect(stripTemplatedDescription(null)).toBe("");
    expect(stripTemplatedDescription("Highly regarded by visitors with a 5/5 rating across 3 reviews.")).toBe("");
  });
});

describe("explore landings and hubs", () => {
  it("leaves destination-wide, stay and dining grids to their hub pages", () => {
    expect(exploreFacetOwnedByHub({ island: "grenada" })).toBe(true);
    expect(exploreFacetOwnedByHub({ island: "grenada", type: "stay" })).toBe(true);
    expect(exploreFacetOwnedByHub({ island: "grenada", type: "dining" })).toBe(true);
    expect(exploreFacetOwnedByHub({ island: "grenada", type: "transport" })).toBe(false);
    expect(exploreFacetOwnedByHub({ type: "stay" })).toBe(false);
  });
  it("labels category landings with the words people search", () => {
    expect(EXPLORE_SEO_LABELS.transport).toBe("Car Rentals & Taxis");
    expect(EXPLORE_SEO_LABELS.transfer).toMatch(/Airport Transfers/);
    expect(EXPLORE_SEO_LABELS.dining).toBe("Restaurants");
  });
});

describe("page metadata and structured data", () => {
  it("gives a static page its own description and share tags, never the homepage's", () => {
    const meta = staticPageMetadata("/contact", "Contact us", "Contact the VakayGo team.");
    expect(meta.alternates?.canonical).toBe("https://vakaygo.com/contact");
    expect(meta.openGraph).toMatchObject({ url: "https://vakaygo.com/contact", title: "Contact us | VakayGo", description: "Contact the VakayGo team." });
    expect(meta.robots).toBeUndefined();
    expect(staticPageMetadata("/gift-cards", "Gift cards", "VakayGo gift cards.", { noindex: true }).robots).toEqual({ index: false, follow: true });
  });
  it("keeps emoji out of breadcrumb names", () => {
    expect(breadcrumbName("🇩🇲 Dominica")).toBe("Dominica");
    expect(breadcrumbName("Grenada")).toBe("Grenada");
  });
  it("never places a destination inside itself", () => {
    expect(destinationStructuredData("dominica", { name: "Dominica", country: "Dominica" })).not.toHaveProperty("containedInPlace");
    expect(destinationStructuredData("santorini", { name: "Santorini", country: "Greece" })).toMatchObject({ containedInPlace: { "@type": "Country", name: "Greece" } });
  });
  it("lets crawlers fetch generated share images while /api stays blocked", () => {
    const rules = robots().rules as { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] }[];
    const all = rules.find(rule => rule.userAgent === "*")!;
    expect(all.allow).toContain("/api/og");
    expect(all.disallow).toContain("/api");
  });
});
