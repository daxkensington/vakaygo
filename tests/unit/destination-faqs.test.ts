import { describe, expect, it } from "vitest";
import {
  buildBestHotelsFaqs,
  buildBestRestaurantsFaqs,
  buildThingsToDoFaqs,
  hubTitleYear,
} from "@/lib/destination-faqs";
import {
  DESTINATION_ESSENTIALS,
  drivingSide,
  getDestinationEssentials,
  localCurrency,
  popularMonths,
} from "@/lib/destination-facts";

const SLUGS = Object.keys(DESTINATION_ESSENTIALS);
const NON_CARIBBEAN = [
  "cartagena", "medellin", "cancun-riviera-maya", "los-cabos", "guanacaste", "ambergris-caye",
  "santorini", "mykonos", "crete", "ibiza", "mallorca", "amalfi-coast-capri", "hvar-split",
];

function allText(slug: string): string {
  const name = `Place-${slug}`;
  return [
    ...buildBestHotelsFaqs({ name, slug }),
    ...buildBestRestaurantsFaqs({ name, slug, cuisines: ["Seafood", "Greek"] }),
    ...buildThingsToDoFaqs({ name, slug, country: "Countryland" }),
  ].map((faq) => `${faq.q} ${faq.a}`).join("\n");
}

describe("destination facts", () => {
  it("covers all 34 destinations", () => {
    expect(SLUGS).toHaveLength(34);
  });

  it("reads seasons, currency and driving side per destination", () => {
    expect(popularMonths("grenada")).toBe("December to May");
    expect(popularMonths("santorini")).toBe("May to October");
    expect(popularMonths("aruba")).toBeNull();
    expect(popularMonths("not-a-destination")).toBeNull();
    expect(localCurrency("santorini")).toBe("EUR (€)");
    expect(localCurrency("medellin")).toBe("COP ($)");
    expect(localCurrency("grenada")).toBe("EC$ (XCD)");
    expect(localCurrency("not-a-destination")).toBeNull();
    expect(drivingSide("grenada")).toBe("left");
    expect(drivingSide("ambergris-caye")).toBe("right");
    expect(getDestinationEssentials("constructor")).toBeNull();
  });
});

describe("destination hub FAQs", () => {
  it.each(SLUGS)("makes no blanket safety, price-band or booking promise for %s", (slug) => {
    const text = allText(slug);
    expect(text).not.toMatch(/generally a safe|is a safe destination|safe, authentic/i);
    expect(text).not.toMatch(/verified (local )?operators?/i);
    expect(text).not.toMatch(/book (rides )?directly/i);
    expect(text).not.toMatch(/rated by real travelers/i);
    expect(text).not.toMatch(/depends on the destination/i);
    expect(text).not.toMatch(/prices upfront/i);
    // No invented price bands in any currency.
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/jerk|roti|callaloo/i);
  });

  it.each(NON_CARIBBEAN)("does not give %s Caribbean seasons or food", (slug) => {
    const text = allText(slug);
    expect(text).not.toMatch(/Caribbean/i);
    expect(text).not.toMatch(/wet season|dry season/i);
  });

  it("uses each destination's own season", () => {
    expect(allText("santorini")).toContain("May to October");
    expect(allText("santorini")).not.toMatch(/December/);
    expect(allText("grenada")).toContain("December to May");
    expect(allText("medellin")).toContain("visited year-round");
    expect(allText("aruba")).not.toMatch(/June|November/);
  });

  it("answers safety with the official advisory for the country, never a verdict", () => {
    const safety = buildThingsToDoFaqs({ name: "Medellín & Guatapé", slug: "medellin", country: "Colombia" })
      .find((faq) => faq.q.includes("safe"));
    expect(safety?.a).toContain("travel advisory for Colombia");
    expect(safety?.a).toContain("does not rate destinations for safety");
  });

  it("states the real currency, and omits the question when it is unknown", () => {
    const known = buildThingsToDoFaqs({ name: "Santorini", slug: "santorini", country: "Greece" });
    expect(known.find((faq) => faq.q.includes("currency"))?.a).toContain("The local currency in Santorini is EUR (€).");
    const unknown = buildThingsToDoFaqs({ name: "Somewhere", slug: "somewhere-new", country: null });
    expect(unknown.some((faq) => faq.q.includes("currency"))).toBe(false);
    expect(unknown.some((faq) => faq.q.includes("best time"))).toBe(false);
    expect(unknown.find((faq) => faq.q.includes("safe"))?.a).toContain("travel advisory for Somewhere");
  });

  it("names cuisines only from the listings shown", () => {
    const withCuisines = buildBestRestaurantsFaqs({ name: "Santorini", slug: "santorini", cuisines: ["Greek", " ", "Seafood"] });
    expect(withCuisines[1].a).toContain("describe their cooking as Greek and Seafood");
    const without = buildBestRestaurantsFaqs({ name: "Santorini", slug: "santorini" });
    expect(without[1].a).not.toContain("describe their cooking");
  });

  it("keeps the same four questions on the hotel and restaurant hubs", () => {
    expect(buildBestHotelsFaqs({ name: "Grenada", slug: "grenada" }).map((faq) => faq.q)).toEqual([
      "What are the best hotels in Grenada?",
      "How much do hotels cost in Grenada?",
      "What type of accommodation is best in Grenada?",
      "Should I book a hotel or vacation rental in Grenada?",
    ]);
    expect(buildBestRestaurantsFaqs({ name: "Grenada", slug: "grenada" })).toHaveLength(4);
  });

  it("derives the title year from the clock", () => {
    expect(hubTitleYear(new Date("2026-12-31T23:59:59Z"))).toBe(2026);
    expect(hubTitleYear(new Date("2027-01-01T00:00:00Z"))).toBe(2027);
  });
});
