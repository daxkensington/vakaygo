import { afterEach, describe, expect, it, vi } from "vitest";
import { ISLAND_FLAGS } from "@/lib/island-flags";
import { COUNTRY_CODES } from "@/lib/countries";
import { DESTINATION_TIMEZONES } from "@/lib/outreach-timezone";
import { checkCampaignSendingWindow } from "@/lib/outreach-campaign-policy";
import {
  DESTINATION_COUNTRY_CODES, OUTREACH_HELD_COUNTRIES, OUTREACH_PRIOR_OPT_IN_COUNTRIES, destinationCountryCode,
  evaluateOutreachCountryGate, outreachCountryStatus, outreachDestinationSlugs, releasedOutreachCountries,
  requiresSolicitationNotice, restrictedOutreachCountries,
} from "@/lib/outreach-country-policy";

afterEach(() => vi.unstubAllEnvs());

/** A flag emoji is two regional-indicator letters: an independent source for the ISO code. */
function flagCountryCode(flag: string): string {
  return [...flag].map(symbol => String.fromCharCode(symbol.codePointAt(0)! - 0x1F1E6 + 65)).join("");
}

// The exact slugs in the production islands table on 2026-11-10. A destination added
// later must be added to ISLAND_FLAGS, the time-zone map and the country map together.
const LIVE_ISLAND_SLUGS = [
  "amalfi-coast-capri", "ambergris-caye", "antigua", "aruba", "bahamas", "barbados", "bonaire", "british-virgin-islands",
  "cancun-riviera-maya", "cartagena", "cayman-islands", "crete", "curacao", "dominica", "dominican-republic", "grenada",
  "guadeloupe", "guanacaste", "hvar-split", "ibiza", "jamaica", "los-cabos", "mallorca", "martinique", "medellin", "mykonos",
  "puerto-rico", "santorini", "st-kitts", "st-lucia", "st-vincent", "trinidad-and-tobago", "turks-and-caicos", "us-virgin-islands",
];

describe("destination coverage", () => {
  it("resolves every destination slug to a time zone that can open a sending window", () => {
    const slugs = [...new Set([...Object.keys(ISLAND_FLAGS), ...LIVE_ISLAND_SLUGS])];
    expect(slugs.length).toBeGreaterThanOrEqual(34);
    for (const slug of slugs) {
      const timeZone = DESTINATION_TIMEZONES[slug];
      expect(timeZone, `no time zone for ${slug}`).toBeTruthy();
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone })).not.toThrow();
      // Some hour of a Wednesday is inside 09:00-17:00 local time for a mapped slug.
      const open = Array.from({ length: 24 }, (_unused, hour) => new Date(Date.UTC(2026, 9, 21, hour, 30)))
        .some(instant => checkCampaignSendingWindow(slug, instant).allowed);
      expect(open, `${slug} never opens`).toBe(true);
    }
  });

  it.each(["antigua", "st-kitts", "st-vincent"])("keeps the short live slug %s sendable", slug => {
    expect(checkCampaignSendingWindow(slug, new Date("2026-10-20T14:00:00Z")).allowed).toBe(true);
  });

  it("maps every destination slug to the ISO country code its flag shows", () => {
    for (const slug of [...new Set([...Object.keys(ISLAND_FLAGS), ...LIVE_ISLAND_SLUGS])]) {
      const code = destinationCountryCode(slug);
      expect(code, `no country for ${slug}`).toBeTruthy();
      expect(COUNTRY_CODES).toContain(code);
      if (ISLAND_FLAGS[slug]) expect(code, slug).toBe(flagCountryCode(ISLAND_FLAGS[slug]));
    }
    expect(Object.keys(DESTINATION_COUNTRY_CODES).sort()).toEqual(Object.keys(ISLAND_FLAGS).sort());
    expect(destinationCountryCode(" Santorini ")).toBe("GR");
    expect(destinationCountryCode("atlantis")).toBeNull();
    expect(destinationCountryCode(null)).toBeNull();
  });
});

describe("country gate for business-permission invitations", () => {
  it("never sends on business permission to a prior opt-in country and holds the reviewed set by default", () => {
    expect([...OUTREACH_PRIOR_OPT_IN_COUNTRIES]).toEqual(["GR", "ES", "IT", "HR", "CR"]);
    expect([...OUTREACH_HELD_COUNTRIES]).toEqual(["MQ", "GP", "CO"]);
    for (const code of OUTREACH_PRIOR_OPT_IN_COUNTRIES) expect(outreachCountryStatus(code, ["GR", "ES", "IT", "HR", "CR"])).toBe("prior_opt_in");
    for (const code of OUTREACH_HELD_COUNTRIES) expect(outreachCountryStatus(code, [])).toBe("held");
    for (const code of ["GD", "PR", "VI", "DO", "JM", "MX", "BQ"]) expect(outreachCountryStatus(code, [])).toBe("open");
    for (const code of ["", "G", "GRC", null, undefined]) expect(outreachCountryStatus(code, [])).toBe("unknown");
    expect(outreachCountryStatus("gr", [])).toBe("prior_opt_in");
  });

  it("releases only held countries, and only from explicit configuration", () => {
    expect(releasedOutreachCountries(undefined)).toEqual([]);
    expect(releasedOutreachCountries(" mq , GP,GR, ES ,xx,MQ")).toEqual(["MQ", "GP"]);
    expect(outreachCountryStatus("MQ", ["MQ"])).toBe("open");
    expect(restrictedOutreachCountries(["CO"])).toEqual(["GR", "ES", "IT", "HR", "CR", "MQ", "GP"]);
    vi.stubEnv("OUTREACH_RELEASED_COUNTRIES", "CO");
    expect(outreachCountryStatus("CO")).toBe("open");
    expect(outreachCountryStatus("CR")).toBe("prior_opt_in");
  });

  it("splits destinations into open and opt-in only", () => {
    const { open, optInOnly } = outreachDestinationSlugs([]);
    expect(optInOnly.sort()).toEqual(["amalfi-coast-capri", "cartagena", "crete", "guadeloupe", "guanacaste", "hvar-split", "ibiza", "mallorca", "martinique", "medellin", "mykonos", "santorini"]);
    for (const slug of ["grenada", "puerto-rico", "us-virgin-islands", "antigua", "st-kitts", "st-vincent", "cancun-riviera-maya", "ambergris-caye"]) expect(open).toContain(slug);
    expect(open.length + optInOnly.length).toBe(Object.keys(DESTINATION_COUNTRY_CODES).length);
    expect(outreachDestinationSlugs(["MQ", "GP", "CO"]).optInOnly.sort()).toEqual(["amalfi-coast-capri", "crete", "guanacaste", "hvar-split", "ibiza", "mallorca", "mykonos", "santorini"]);
  });

  it.each([
    ["grenada", [{ kind: "business_outreach_permission", country: "GD" }], true, undefined],
    ["grenada", [], true, undefined],
    ["grenada", undefined, true, undefined],
    ["santorini", [{ kind: "business_outreach_permission", country: "GR" }], false, "country_requires_explicit_opt_in"],
    ["santorini", [{ kind: "business_outreach_permission", country: "GD" }], false, "country_requires_explicit_opt_in"],
    ["santorini", [], false, "country_requires_explicit_opt_in"],
    ["santorini", [{ kind: "explicit_opt_in", country: null }], true, undefined],
    ["guanacaste", [{ kind: "business_outreach_permission", country: "CR" }], false, "country_requires_explicit_opt_in"],
    ["martinique", [{ kind: "business_outreach_permission", country: "MQ" }], false, "country_on_hold"],
    ["medellin", [{ kind: "business_outreach_permission", country: "CO" }], false, "country_on_hold"],
    ["grenada", [{ kind: "business_outreach_permission", country: "IT" }], false, "country_requires_explicit_opt_in"],
    ["grenada", [{ kind: "business_outreach_permission", country: "MQ" }], false, "country_on_hold"],
    ["grenada", [{ kind: "business_outreach_permission", country: "IT" }, { kind: "business_outreach_permission", country: "GD" }], true, undefined],
    ["unmapped-destination", [{ kind: "business_outreach_permission", country: "GD" }], false, "destination_country_unknown"],
    ["unmapped-destination", [{ kind: "explicit_opt_in", country: null }], true, undefined],
  ])("%s with %j => allowed %s", (islandSlug, permissions, allowed, reason) => {
    const result = evaluateOutreachCountryGate({ islandSlug: islandSlug as string, permissions: permissions as never, released: [] });
    expect(result.allowed).toBe(allowed);
    expect(result.reason).toBe(reason);
  });

  it("lets the owner release a held country without touching a prior opt-in one", () => {
    const permission = [{ kind: "business_outreach_permission", country: "MQ" }];
    expect(evaluateOutreachCountryGate({ islandSlug: "martinique", permissions: permission, released: ["MQ"] }).allowed).toBe(true);
    expect(evaluateOutreachCountryGate({ islandSlug: "santorini", permissions: [{ kind: "business_outreach_permission", country: "GR" }], released: ["GR"] as never }).allowed).toBe(false);
  });

  it("requires the solicitation notice only under US law", () => {
    expect(["puerto-rico", "us-virgin-islands", "usvi"].every(requiresSolicitationNotice)).toBe(true);
    expect(["grenada", "santorini", "british-virgin-islands", "unknown"].some(requiresSolicitationNotice)).toBe(false);
  });
});
