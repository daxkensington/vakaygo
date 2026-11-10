// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { displayedHeadline, isGenericDirectoryHeadline, isNaturalPublicPlace, listingRatingSource, ratingCountLabel } from "@/lib/listing-display";
import { displayedGuestCapacity, guestCountOptions, localDateInputValue, resolveListingGuestCapacity } from "@/lib/listing-capacity";
import { stayFitsGuests } from "@/server/listing-capacity";
import { listingRatingIsGoogleSql, listingReviewSourceSql } from "@/server/listing-review-source";
import { flagEmojiSupported } from "@/lib/flag-emoji";

describe("imported headlines", () => {
  // Every one of these is live on production listings.
  it.each([
    "Tours & activities in Grenada", "Adventures in Puerto Rico", "Beach Bar in Grenada", "Airport Transfer in the Caribbean",
    "Tours & activities in St. George", "Tours & activities in St. Vincent & the Grenadines", "Bar & Grill in Grenada",
    "Tours & activities in St. Kitts & Nevis", "Boutique Stay in Willemstad, Curaçao", "Restaurant & Dining in St Lucia, St. Lucia",
    "Bar in St George's, Grenada", "Boutique Stay in West Bay 1401, Cayman Islands", "Restaurant & Dining in punta Cana, Dominican Republic",
    "Restaurant & Dining in St Vincent and the Grenadines, St. Vincent & the Grenadines", "Transfers in Trinidad & Tobago",
  ])("treats %s as the importer's category label", (headline) => {
    expect(isGenericDirectoryHeadline(headline)).toBe(true);
    expect(displayedHeadline(headline)).toBeNull();
  });

  it("recognises the importer's 'Experience <title> in <place>' shape by the listing's own title", () => {
    expect(isGenericDirectoryHeadline("Experience AKRA SPA in Santorini", "AKRA SPA")).toBe(true);
    // The title can contain " in " itself.
    expect(isGenericDirectoryHeadline("Experience So Spa! at Once in Mykonos in Mykonos", "So Spa! at Once in Mykonos")).toBe(true);
    expect(displayedHeadline("Experience Santorini Island Tour in Santorini", "Santorini Island Tour")).toBeNull();
    // Without the title match it is someone's sentence.
    expect(isGenericDirectoryHeadline("Experience the caldera at sunset from a private catamaran in Santorini", "Santorini Island Tour")).toBe(false);
  });

  // The first three are the only headlines businesses had written on production in November 2026.
  it.each([
    "Guided Jet Car rentals, Jet Ski tours, and ATV adventures in Providenciales",
    "Visit 4 places in one day. 8am-4pm",
    "Facials, massage, waxing and brow artistry in George Town",
    "Eco-friendly 100% private boat charters and scuba diving experiences in Curaçao",
    "Sunset catamaran cruises with an open bar, since 1998",
    "The only PADI five-star dive centre in the north of the island",
    "Fresh lobster. Cold beer. Feet in the sand.",
  ])("keeps a written headline: %s", (headline) => {
    expect(isGenericDirectoryHeadline(headline)).toBe(false);
    expect(displayedHeadline(headline)).toBe(headline);
  });

  it("renders nothing for an empty headline", () => {
    expect(displayedHeadline("  ")).toBeNull();
    expect(displayedHeadline(null, "Any listing")).toBeNull();
  });
});

describe("guest capacity", () => {
  it("shows a capacity only when a verified business stands behind it", () => {
    expect(displayedGuestCapacity(false, 8, undefined)).toBeNull();
    expect(displayedGuestCapacity(undefined, 4, "4")).toBeNull();
    expect(displayedGuestCapacity(true, 99, undefined)).toBe(99);
    expect(displayedGuestCapacity(true, null, "6")).toBe(6);
    expect(resolveListingGuestCapacity(8, undefined)).toBe(8);
  });

  it("offers exactly the guest counts the listing can take", () => {
    expect(guestCountOptions(2)).toEqual([1, 2]);
    expect(guestCountOptions(99)).toHaveLength(99);
    expect(guestCountOptions(99).at(-1)).toBe(99);
    expect(guestCountOptions(5000)).toHaveLength(100);
    expect(guestCountOptions(null)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(guestCountOptions(0)).toHaveLength(8);
  });

  it("keeps stays of unknown capacity in a guests search", () => {
    const { sql, params } = new PgDialect().sqlToQuery(stayFitsGuests(5));
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toContain("NOT (CASE WHEN EXISTS");
    expect(flat).toContain("vakaygo_listing_claim_verified");
    expect(flat).toMatch(/OR coalesce\("listings"\."max_guests".*>= \$\d+\)$/);
    expect(params).toContain(5);
  });

  it("formats a date input value in the viewer's own calendar", () => {
    expect(localDateInputValue(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(localDateInputValue(new Date(2026, 10, 30, 0, 5))).toBe("2026-11-30");
  });
});

describe("ratings on imported listings", () => {
  it("names Google wherever the figures are Google's", () => {
    expect(listingRatingSource({ unclaimed: true })).toBe("google");
    expect(listingRatingSource({ unclaimed: false, source: "google-places" })).toBe("google");
    expect(listingRatingSource({ unclaimed: false, source: "partner-request" })).toBe("vakaygo");
    expect(listingRatingSource(null)).toBe("vakaygo");
    expect(ratingCountLabel(208, "google")).toBe("208 Google");
    expect(ratingCountLabel(0, "google")).toBe("Google");
    expect(ratingCountLabel(12, "vakaygo")).toBe("12");
    expect(ratingCountLabel(null, "vakaygo")).toBe("");
  });

  it("uses one SQL rule for the label and for protecting Google's figures", () => {
    const label = new PgDialect().sqlToQuery(listingReviewSourceSql).sql.replace(/\s+/g, " ");
    expect(label).toContain(`"listings"."type_data"->>'unclaimed' = 'true'`);
    expect(label).toContain(`"listings"."type_data"->>'source' = 'google-places'`);
    const guard = new PgDialect().sqlToQuery(listingRatingIsGoogleSql).sql.replace(/\s+/g, " ");
    expect(guard).toContain("'unclaimed', '') = 'true'");
    expect(guard).toContain("'source', '') = 'google-places'");
  });
});

describe("public places", () => {
  it("recognises a natural place nobody runs", () => {
    expect(isNaturalPublicPlace({ googleTypes: ["establishment", "natural_feature"] })).toBe(true);
    expect(isNaturalPublicPlace({ googleTypes: ["natural_feature", "point_of_interest", "tourist_attraction"] })).toBe(true);
  });

  it("leaves anything an organisation could run claimable", () => {
    expect(isNaturalPublicPlace({ googleTypes: ["natural_feature", "travel_agency"] })).toBe(false);
    expect(isNaturalPublicPlace({ googleTypes: ["establishment", "park", "point_of_interest", "tourist_attraction"] })).toBe(false);
    expect(isNaturalPublicPlace({ googleTypes: ["museum", "tourist_attraction"] })).toBe(false);
    expect(isNaturalPublicPlace({ googleTypes: ["tourist_attraction", "point_of_interest"] })).toBe(false);
    expect(isNaturalPublicPlace({ googleTypes: "natural_feature" })).toBe(false);
    expect(isNaturalPublicPlace({})).toBe(false);
    expect(isNaturalPublicPlace(null)).toBe(false);
  });
});

describe("flag emoji", () => {
  it("knows which platforms cannot draw country flags", () => {
    expect(flagEmojiSupported("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe(false);
    expect(flagEmojiSupported("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toBe(false);
    expect(flagEmojiSupported("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe(true);
    expect(flagEmojiSupported("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(true);
    expect(flagEmojiSupported("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe(true);
    expect(flagEmojiSupported("")).toBe(true);
    expect(flagEmojiSupported(null)).toBe(true);
  });
});
