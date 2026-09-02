import { describe, it, expect } from "vitest";
import { parseSearchQuery, stemTerm, likeEscape } from "@/lib/search-terms";

describe("search-terms", () => {
  it("collapses British/American spelling and plurals to one stem", () => {
    expect(stemTerm("snorkelling")).toBe("snorkel");
    expect(stemTerm("snorkeling")).toBe("snorkel");
    expect(stemTerm("snorkel")).toBe("snorkel");
    expect(stemTerm("tours")).toBe("tour");
    expect(stemTerm("cruises")).toBe("cruis");
    expect(stemTerm("cruise")).toBe("cruis");
    expect(stemTerm("cruising")).toBe("cruis");
    expect(stemTerm("beaches")).toBe("beach");
    expect(stemTerm("spa")).toBe("spa");
    expect(stemTerm("glass")).toBe("glass");
  });

  it("splits a phrase into AND-ed terms and drops noise words", () => {
    const r = parseSearchQuery("best sunset cruise in Grenada");
    expect(r.terms).toEqual(["sunset", "cruis", "grenada"]);
    expect(r.compact).toBe("bestsunsetcruiseingrenada");
    expect(r.phrase).toBe("best sunset cruise in grenada");
  });

  it("keeps a query that is only noise words matchable", () => {
    expect(parseSearchQuery("the").terms).toEqual(["the"]);
    expect(parseSearchQuery("").terms).toEqual([]);
  });

  it("has no compact form for a single word", () => {
    expect(parseSearchQuery("catamaran").compact).toBeNull();
  });

  it("escapes LIKE metacharacters", () => {
    expect(likeEscape("100% jerk_chicken\\")).toBe("100\\% jerk\\_chicken\\\\");
  });
});
