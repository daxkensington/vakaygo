import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GRENADA_EXPERIENCE_TOPICS } from "@/lib/grenada-experiences";

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/server/grenada-experiences", () => ({ getGrenadaExperiences: load }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/components/ui/breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/components/shared/image-fallback", () => ({ ImageWithFallback: () => null }));

import Page, { generateMetadata } from "@/app/(platform)/grenada/experiences/[[...segments]]/page";

function directory(overrides = {}) {
  return {
    island: { slug: "grenada", name: "Grenada" }, topic: null, page: 1, pageSize: 24,
    totalCount: 25, totalPages: 2,
    topics: GRENADA_EXPERIENCE_TOPICS.map(topic => ({ ...topic, count: 1 })),
    listings: [{ id: "public", title: "Independent Boat Tours", slug: "independent-boat-tours", type: "tour", islandSlug: "grenada", parish: null, image: null }],
    ...overrides,
  };
}
beforeEach(() => { load.mockReset(); load.mockResolvedValue(directory()); });

describe("Grenada experience discovery page", () => {
  it("links to current listing details without claiming a price, reservation or owned operation", async () => {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({}) }));
    expect(html).toContain('href="/grenada/independent-boat-tours"');
    expect(html).toContain('href="/grenada/experiences/page/2"');
    expect(html).toContain("View listing");
    expect(html).not.toContain("Book now");
    expect(html).not.toContain('"Offer"');
    expect(html).not.toContain('"price"');
    expect(html).not.toContain("Landfall");
  });
  it("gives a populated first page its own canonical and indexable metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({}) });
    expect(metadata.alternates).toEqual({ canonical: "https://vakaygo.com/grenada/experiences" });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
  it("keeps pagination crawlable with a self canonical and noindex metadata", async () => {
    load.mockResolvedValue(directory({ page: 2 }));
    const props = { params: Promise.resolve({ segments: ["page", "2"] }) };
    const metadata = await generateMetadata(props);
    expect(metadata.alternates).toEqual({ canonical: "https://vakaygo.com/grenada/experiences/page/2" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain('href="/grenada/experiences"');
    expect(html).not.toContain('rel="next"');
  });
  it("shows a confirmed empty topic honestly and excludes it from indexing", async () => {
    load.mockResolvedValue(directory({ topic: GRENADA_EXPERIENCE_TOPICS[1], totalCount: 0, totalPages: 0, listings: [] }));
    const props = { params: Promise.resolve({ segments: ["jet-ski"] }) };
    expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: true });
    expect(renderToStaticMarkup(await Page(props))).toContain("No listings are currently shown");
  });
  it("offers search at the pagination boundary without linking to an invalid next page", async () => {
    load.mockResolvedValue(directory({ page: 1000, totalCount: 24001, totalPages: 1000 }));
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ segments: ["page", "1000"] }) }));
    expect(html).not.toContain('rel="next"');
    expect(html).toContain('href="/grenada/experiences/page/999"');
    expect(html).toContain("For more results, choose an activity");
  });
  it("does not disguise a database failure as an empty category", async () => {
    load.mockRejectedValue(new Error("test database unavailable"));
    await expect(Page({ params: Promise.resolve({}) })).rejects.toThrow("test database unavailable");
    await expect(generateMetadata({ params: Promise.resolve({}) })).rejects.toThrow("test database unavailable");
  });
  it("rejects unknown routes before database selection and out-of-range pages after counts", async () => {
    await expect(Page({ params: Promise.resolve({ segments: ["landfall"] }) })).rejects.toThrow("NOT_FOUND");
    expect(load).not.toHaveBeenCalled();
    load.mockResolvedValue(directory({ totalPages: 1 }));
    await expect(Page({ params: Promise.resolve({ segments: ["page", "2"] }) })).rejects.toThrow("NOT_FOUND");
  });
});
