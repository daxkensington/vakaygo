// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDestinationHubTitle,
  buildListingDescription,
  buildListingTitle,
  buildTopicHubTitle,
  cleanLocationLabel,
  listingTitleHook,
  placeKey,
  stripTemplatedDescription,
} from "@/lib/listing-seo";
import { exploreFacetOwnedByHub, EXPLORE_SEO_LABELS } from "@/lib/listing-filters";
import { HOMEPAGE_DESCRIPTION, HOMEPAGE_TITLE, staticPageMetadata } from "@/lib/page-metadata";
import { LLMS_DESTINATION_DIRECTORY } from "@/lib/llms-full";
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
  it("gives bars, lounges, nightclubs and beach clubs a Menu hook, and public beaches a Location & Map hook", () => {
    const barKitchenHook = listingTitleHook("dining", { name: "6Mix Bar & Kitchen" });
    expect(barKitchenHook).toBe("Menu, Hours & Location");
    expect(buildListingTitle("6Mix Bar & Kitchen", "Bridgetown, Barbados", barKitchenHook)).toBe(
      "6Mix Bar & Kitchen (Bridgetown, Barbados) — Menu & Hours",
    );

    const loungeHook = listingTitleHook("event", { name: "78 West Lounge" });
    expect(loungeHook).toBe("Menu, Hours & Location");
    expect(buildListingTitle("78 West Lounge", "Nassau, The Bahamas", loungeHook)).toBe(
      "78 West Lounge (Nassau, The Bahamas) — Menu, Hours & Location",
    );

    const dayLoungeHook = listingTitleHook("dining", { name: "12 to 12 Day Lounge" });
    expect(dayLoungeHook).toBe("Menu, Hours & Location");
    expect(buildListingTitle("12 to 12 Day Lounge", "Kingston, Jamaica", dayLoungeHook)).toBe(
      "12 to 12 Day Lounge (Kingston, Jamaica) — Menu, Hours & Location",
    );

    const clubHook = listingTitleHook("event", { name: "Taboo Kingston", googleTypes: ["night_club", "bar"] });
    expect(clubHook).toBe("Menu, Hours & Location");
    expect(buildListingTitle("Taboo Kingston", "Kingston, Jamaica", clubHook)).toBe(
      "Taboo Kingston (Kingston, Jamaica) — Menu, Hours & Location",
    );

    const beachClubHook = listingTitleHook("vip", { name: "Coral Beach Club" });
    expect(beachClubHook).toBe("Menu, Hours & Location");

    const beachHook = listingTitleHook("excursion", { name: "Mongoose Beach" });
    expect(beachHook).toBe("Location, Map & Photos");
    expect(buildListingTitle("Mongoose Beach", "St. Kitts & Nevis", beachHook)).toBe(
      "Mongoose Beach (St. Kitts & Nevis) — Location, Map & Photos",
    );
    expect(buildListingTitle("Mongoose Beach", "Frigate Bay, St. Kitts & Nevis", beachHook)).toBe(
      "Mongoose Beach (Frigate Bay, St. Kitts & Nevis) — Location & Map",
    );

    // Commercial tours and stays with "Beach" in the name keep their category hook.
    expect(listingTitleHook("tour", { name: "Grand Anse Beach Snorkel Tour" })).toBe("Tour Details & Photos");
    expect(listingTitleHook("stay", { name: "Bungalow on the Beach" })).toBe("Photos, Amenities & Location");
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
  it("ignores generic importer headlines and generates intent-matched descriptions <= 158 chars", () => {
    const loungeDesc = buildListingDescription({
      name: "78 West Lounge",
      type: "dining",
      typeLabel: "Restaurant",
      location: "Nassau, The Bahamas",
      hook: "Menu, Hours & Location",
      description: "Highly regarded by visitors with a 4.7/5 rating across 88 reviews.",
      headline: "Restaurant & Dining in Nassau, The Bahamas",
      options: { name: "78 West Lounge" },
    });
    expect(loungeDesc).toContain("menu, opening hours, photos, and location");
    expect(loungeDesc.length).toBeLessThanOrEqual(158);

    const beachDesc = buildListingDescription({
      name: "Mongoose Beach",
      type: "excursion",
      typeLabel: "Excursion",
      location: "St. Kitts & Nevis",
      hook: "Location, Map & Photos",
      description: null,
      headline: "Excursions in St. Kitts",
      options: { name: "Mongoose Beach" },
    });
    expect(beachDesc).toMatch(/^Where is Mongoose Beach\?/);
    expect(beachDesc.length).toBeLessThanOrEqual(158);
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
  it("explicitly allows all major AI answer-engine bots on /, /llms.txt, /llms-full.txt and blocks CCBot + Bytespider", () => {
    const rules = robots().rules as { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] }[];
    const aiRule = rules.find(rule => Array.isArray(rule.userAgent) && rule.userAgent.includes("OAI-SearchBot"))!;
    expect(aiRule).toBeDefined();
    for (const bot of [
      "OAI-SearchBot",
      "ChatGPT-User",
      "GPTBot",
      "Claude-SearchBot",
      "Claude-Web",
      "ClaudeBot",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Applebot-Extended",
      "DuckAssistBot",
      "YouBot",
    ]) {
      expect(aiRule.userAgent).toContain(bot);
    }
    expect(aiRule.allow).toEqual(expect.arrayContaining(["/", "/llms.txt", "/llms-full.txt"]));

    const blockedRule = rules.find(rule => Array.isArray(rule.userAgent) && rule.userAgent.includes("CCBot"))!;
    expect(blockedRule).toBeDefined();
    expect(blockedRule.userAgent).toEqual(expect.arrayContaining(["CCBot", "Bytespider"]));
    expect(blockedRule.disallow).toBe("/");
  });
  it("keeps homepage and destination/topic hub titles <= 60 chars and homepage description <= 158 chars", () => {
    expect(HOMEPAGE_TITLE.length).toBeLessThanOrEqual(60);
    expect(HOMEPAGE_DESCRIPTION.length).toBeLessThanOrEqual(158);
    for (const dest of LLMS_DESTINATION_DIRECTORY) {
      expect(buildDestinationHubTitle(dest.name).length).toBeLessThanOrEqual(60);
      expect(buildTopicHubTitle("Best Hotels", dest.name, 2026, "Stays & Villas").length).toBeLessThanOrEqual(60);
      expect(buildTopicHubTitle("Best Restaurants", dest.name, 2026, "Local Dining").length).toBeLessThanOrEqual(60);
      expect(buildTopicHubTitle("Things to Do", dest.name, 2026, "Tours & Beaches").length).toBeLessThanOrEqual(60);
    }
    const nextConfigSrc = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(nextConfigSrc).toContain("htmlLimitedBots: /.*/");
  });
});
