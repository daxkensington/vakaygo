import { describe, it, expect } from "vitest";
import {
  parseListingFilters,
  filtersToSearchParams,
  isIndexableFilterSet,
  EXPLORE_PAGE_SIZE,
} from "@/lib/listing-filters";

describe("parseListingFilters", () => {
  it("returns defaults for an empty query", () => {
    const f = parseListingFilters(new URLSearchParams(""));
    expect(f).toMatchObject({
      type: null,
      island: null,
      q: null,
      sort: "recommended",
      limit: EXPLORE_PAGE_SIZE,
      offset: 0,
      amenities: [],
    });
  });

  it("accepts Next's searchParams object shape, including arrays", () => {
    const f = parseListingFilters({ type: ["stay", "tour"], island: "grenada", q: undefined });
    expect(f.type).toBe("stay");
    expect(f.island).toBe("grenada");
    expect(f.q).toBeNull();
  });

  it("drops unknown types, islands with bad characters, and 'all'", () => {
    expect(parseListingFilters(new URLSearchParams("type=all")).type).toBeNull();
    expect(parseListingFilters(new URLSearchParams("type=hotel")).type).toBeNull();
    expect(parseListingFilters(new URLSearchParams("type=spa")).type).toBe("spa");
    expect(parseListingFilters(new URLSearchParams("island=Grenada'--")).island).toBeNull();
  });

  it("honours the legacy category= alias", () => {
    expect(parseListingFilters(new URLSearchParams("category=dining")).type).toBe("dining");
  });

  it("validates numbers and ranges", () => {
    const f = parseListingFilters(new URLSearchParams("minPrice=abc&maxPrice=-5&minRating=4.5&guests=0&offset=-1"));
    expect(f.minPrice).toBeNull();
    expect(f.maxPrice).toBeNull();
    expect(f.minRating).toBe(4.5);
    expect(f.guests).toBeNull();
    expect(f.offset).toBe(0);
  });

  it("caps limit at 100 unless the caller allows bulk", () => {
    expect(parseListingFilters(new URLSearchParams("limit=2000")).limit).toBe(100);
    expect(parseListingFilters(new URLSearchParams("limit=2000"), { maxLimit: 2000 }).limit).toBe(2000);
    expect(parseListingFilters(new URLSearchParams("limit=0")).limit).toBe(EXPLORE_PAGE_SIZE);
  });

  it("only keeps a well-formed date", () => {
    expect(parseListingFilters(new URLSearchParams("date=2026-12-25")).date).toBe("2026-12-25");
    expect(parseListingFilters(new URLSearchParams("date=tomorrow")).date).toBeNull();
    expect(parseListingFilters(new URLSearchParams("date=2026-13-45")).date).toBeNull();
  });

  it("cleans the amenities list", () => {
    const f = parseListingFilters(new URLSearchParams("amenities=wifi,Pool,,bad%20one"));
    expect(f.amenities).toEqual(["wifi", "pool"]);
  });

  it("falls back to recommended for an unknown sort", () => {
    expect(parseListingFilters(new URLSearchParams("sort=trending")).sort).toBe("recommended");
    expect(parseListingFilters(new URLSearchParams("sort=price-asc")).sort).toBe("price-asc");
  });
});

describe("filtersToSearchParams", () => {
  it("round-trips in a stable order and omits defaults", () => {
    const f = parseListingFilters(new URLSearchParams("sort=recommended&type=stay&island=grenada&q=beach"));
    expect(filtersToSearchParams(f).toString()).toBe("island=grenada&type=stay&q=beach");
    expect(filtersToSearchParams(f, { includePaging: true }).toString()).toBe(
      `island=grenada&type=stay&q=beach&limit=${EXPLORE_PAGE_SIZE}`,
    );
  });
});

describe("isIndexableFilterSet", () => {
  it("indexes island/type landings only", () => {
    expect(isIndexableFilterSet(parseListingFilters(new URLSearchParams("")))).toBe(true);
    expect(isIndexableFilterSet(parseListingFilters(new URLSearchParams("island=grenada&type=stay")))).toBe(true);
    expect(isIndexableFilterSet(parseListingFilters(new URLSearchParams("q=beach")))).toBe(false);
    expect(isIndexableFilterSet(parseListingFilters(new URLSearchParams("type=stay&minPrice=50")))).toBe(false);
    expect(isIndexableFilterSet(parseListingFilters(new URLSearchParams("sort=rating")))).toBe(false);
  });
});
