// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseListingFilters } from "@/lib/listing-filters";
import { buildMetadata } from "@/app/(platform)/explore/explore-server";
import { getExploreData } from "@/server/listings-search";

vi.mock("@/server/listings-search", () => ({
  getExploreData: vi.fn(),
  exploreCacheKey: () => "explore-metadata-test",
}));
vi.mock("@/app/(platform)/explore/explore-client", () => ({
  ExploreClient: () => null,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

const filters = parseListingFilters({ island: "jamaica", type: "guide" });
const empty = {
  listings: [],
  totalCount: 0,
  island: { slug: "jamaica", name: "Jamaica" },
};

describe("explore landing metadata", () => {
  beforeEach(() => {
    vi.mocked(getExploreData).mockReset();
  });

  it("keeps an empty destination/category browsable without indexing it", async () => {
    vi.mocked(getExploreData).mockResolvedValue(empty);
    const metadata = await buildMetadata(filters);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toBe("Local Guides in Jamaica");
    expect(metadata.alternates?.canonical).toBe(
      "https://vakaygo.com/explore?island=jamaica&type=guide",
    );
  });

  it("makes the same landing indexable when listings become available", async () => {
    vi.mocked(getExploreData).mockResolvedValue({ ...empty, totalCount: 1 });
    expect((await buildMetadata(filters)).robots).toBeUndefined();
  });

  it("checks counts for category-only landings too", async () => {
    vi.mocked(getExploreData).mockResolvedValue({ ...empty, island: null });
    const metadata = await buildMetadata(parseListingFilters({ type: "guide" }));
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toBe("Local Guides in the Caribbean");
  });

  it("does not mistake a database outage for an empty category", async () => {
    vi.mocked(getExploreData).mockRejectedValue(new Error("Database unavailable"));
    expect((await buildMetadata(filters)).robots).toBeUndefined();
  });

  it("preserves noindex for searches without an extra catalogue query", async () => {
    const metadata = await buildMetadata(parseListingFilters({ q: "waterfalls" }));
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(getExploreData).not.toHaveBeenCalled();
  });

  it("uses supplied results without fetching them again", async () => {
    const metadata = await buildMetadata(filters, empty);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(getExploreData).not.toHaveBeenCalled();
  });
});
