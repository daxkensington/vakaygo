import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/published-island-guide-links-20261019.json";

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/components/ui/breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("../../app/(platform)/[island]/featured-listings-client", () => ({ FeaturedListingsClient: () => null }));
vi.mock("@/server/seo-queries", () => ({
  getIslandBySlug: async (slug: string) => ({ id: 1, name: slug, slug, country: slug, description: "Fixture destination" }),
  getIslandStats: async () => ({ totalListings: 0, typeCounts: {} }),
  getTopListingsForIsland: async () => [],
  getAllListingSlugsForIsland: async () => [],
}));

import IslandPage from "../../app/(platform)/[island]/page";

// Vitest uses the classic runtime for the project's preserved TSX.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("published island editorial guide links", () => {
  it("retains the independently captured 32 unique same-island corrections and two working targets", () => {
    expect(fixture.targets).toHaveLength(34);
    expect(fixture.targets.filter(row => row.changed)).toHaveLength(32);
    for (const row of fixture.targets.filter(row => row.changed)) {
      expect(row.previous_http_status).toBe(404);
      expect(row.expected_http_status).toBe(200);
      expect(row.same_island_published_candidates).toHaveLength(1);
      expect(row.same_island_published_candidates[0]).toMatchObject({
        islandSlug: row.island, category: "destination-guide", slug: row.expected_slug,
      });
    }
  });

  it.each(fixture.targets)("renders the evidenced editorial target for $island", async row => {
    const page = await IslandPage({ params: Promise.resolve({ island: row.island }) });
    const html = renderToStaticMarkup(page);
    const editorialHrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .filter(match => match[2].includes("Editorial Guide")).map(match => match[1]);
    expect(editorialHrefs).toEqual([`/guides/${row.expected_slug}`]);
    if (row.changed) expect(editorialHrefs).not.toContain(`/guides/${row.previous_slug}`);
  });
});
