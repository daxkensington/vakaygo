import { describe, expect, it } from "vitest";
import { grenadaExperiencePath, parseGrenadaExperienceRoute } from "@/lib/grenada-experience-routes";

describe("Grenada experience route boundaries", () => {
  it("keeps the hub, topic and paginated topic distinct", () => {
    expect(parseGrenadaExperienceRoute()).toEqual({ page: 1 });
    expect(parseGrenadaExperienceRoute(["boat-trips"])).toEqual({ topic: "boat-trips", page: 1 });
    expect(parseGrenadaExperienceRoute(["page", "2"])).toEqual({ page: 2 });
    expect(parseGrenadaExperienceRoute(["boat-trips", "page", "2"])).toEqual({ topic: "boat-trips", page: 2 });
    expect(grenadaExperiencePath("boat-trips", 2)).toBe("/grenada/experiences/boat-trips/page/2");
  });
  it.each([["unknown"], ["landfall"], ["whale-watching"], ["page", "1"], ["page", "02"], ["page", "0"], ["page", "1001"], ["page", "2.5"], ["boat-trips", "wrong", "2"], ["boat-trips", "page", "2", "extra"]])("rejects unsupported or noncanonical route %j", (...segments) => {
    expect(parseGrenadaExperienceRoute(segments)).toBeNull();
  });
});
