import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildHubListItem } from "@/lib/hub-structured-data";

const listing = {
  title: "Seaside Santorini",
  slug: "seaside-santorini",
  islandSlug: "santorini",
  parish: "Perivolos",
  // Present on the real rows; must never reach the markup.
  avgRating: "4.70",
  reviewCount: 3320,
  priceAmount: "220.00",
};

describe("hub ItemList entries", () => {
  it("marks up name, URL and address only", () => {
    const item = buildHubListItem("Restaurant", listing, { name: "Santorini", country: "Greece" });
    expect(item).toEqual({
      "@type": "Restaurant",
      name: "Seaside Santorini",
      url: "https://vakaygo.com/santorini/seaside-santorini",
      address: { "@type": "PostalAddress", addressLocality: "Perivolos", addressCountry: "Greece" },
    });
  });

  it("never emits imported ratings or a derived price range", () => {
    const json = JSON.stringify(buildHubListItem("LodgingBusiness", listing, { name: "Santorini", country: "Greece" }));
    expect(json).not.toMatch(/aggregateRating|AggregateRating|reviewCount|ratingValue|priceRange/);
  });

  it("falls back to the destination name for the locality", () => {
    const item = buildHubListItem("LodgingBusiness", { ...listing, parish: null }, { name: "Santorini", country: null });
    expect(item.address).toEqual({ "@type": "PostalAddress", addressLocality: "Santorini" });
  });

  it.each([
    "app/(marketing)/best-hotels/[island]/page.tsx",
    "app/(marketing)/best-restaurants/[island]/page.tsx",
  ])("%s builds its list items with the shared helper and no rating markup", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).toContain("buildHubListItem(");
    expect(source).not.toMatch(/aggregateRating|AggregateRating/);
    expect(source).not.toMatch(/priceRange:\s/);
    expect(source).not.toContain("(2026)");
  });
});
