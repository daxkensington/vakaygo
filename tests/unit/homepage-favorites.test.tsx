import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    void prefetch;
    return React.createElement("a", props, children);
  },
}));
vi.mock("@/components/listings/listing-card", () => ({
  ListingCard: ({ title, slug, islandSlug }: { title: string; slug: string; islandSlug: string }) =>
    React.createElement("a", { href: `/${islandSlug}/${slug}` }, title),
}));

import { FeaturedListings } from "@/components/landing/featured-listings";

const listing = (index: number) => ({
  id: `listing-${index}`, title: `Traveler favorite ${index}`, slug: `favorite-${index}`,
  type: "tour", islandSlug: "grenada", islandName: "Grenada", headline: null,
  priceAmount: null, priceCurrency: null, priceUnit: null, avgRating: "4.8",
  reviewCount: 12, parish: null, isFeatured: true, image: null,
});
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => Response.json({ listings: [] }));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render() { await act(async () => root.render(<FeaturedListings />)); }
async function interact(event = "scroll") { await act(async () => { window.dispatchEvent(new Event(event)); }); }
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }
function cards() { return Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/grenada/favorite-"]')); }
function expectDirectoryLink() {
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href="/explore?sort=rating"]'));
  expect(links.length).toBeGreaterThan(0);
  expect(links.some(link => /view all/i.test(link.textContent ?? ""))).toBe(true);
  for (const link of links) expect(link.closest("[hidden], details:not([open])")).toBeNull();
}

describe("homepage traveler favorites", () => {
  it("defers loading and fetches once after interaction despite repeated events and the fallback timer", async () => {
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("h2")?.textContent).toContain("Traveler favorites");
    expectDirectoryLink();
    await advance(3999);
    expect(fetchMock).not.toHaveBeenCalled();
    await interact();
    await interact();
    await interact("touchstart");
    await advance(8000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/listings?sort=rating&limit=4");
  });

  it("loads once after four seconds when there is no interaction", async () => {
    await render();
    await advance(3999);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await interact();
    await interact("touchstart");
    await advance(8000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows at most four real listing links even if the API returns more, while retaining the full directory", async () => {
    fetchMock.mockResolvedValue(Response.json({ listings: Array.from({ length: 7 }, (_, index) => listing(index + 1)) }));
    await render();
    expect(cards()).toHaveLength(0);
    await interact();
    expect(cards().map(link => [link.getAttribute("href"), link.textContent])).toEqual([
      ["/grenada/favorite-1", "Traveler favorite 1"],
      ["/grenada/favorite-2", "Traveler favorite 2"],
      ["/grenada/favorite-3", "Traveler favorite 3"],
      ["/grenada/favorite-4", "Traveler favorite 4"],
    ]);
    expectDirectoryLink();
  });

  it.each(["empty", "network failure", "HTTP failure", "malformed response"])("keeps a usable directory link and no invented cards after %s", async scenario => {
    if (scenario === "network failure") fetchMock.mockRejectedValue(new Error("Offline"));
    else if (scenario === "HTTP failure") fetchMock.mockResolvedValue(Response.json({ listings: [listing(1)] }, { status: 503 }));
    else if (scenario === "malformed response") fetchMock.mockResolvedValue(Response.json({ listings: { unavailable: true } }));
    else fetchMock.mockResolvedValue(Response.json({ listings: [] }));
    await render();
    await interact();
    expect(cards()).toHaveLength(0);
    expect(container.querySelector("h2")?.textContent).toContain("Traveler favorites");
    expectDirectoryLink();
  });

  it("cancels the deferred start and interaction listeners when visitors leave before loading", async () => {
    await render();
    await act(async () => root.render(null));
    await interact();
    await interact("touchstart");
    await advance(8000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts an in-flight request on unmount and ignores its late response", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    await render();
    await interact();
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal | undefined;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
    await act(async () => root.render(null));
    expect(signal!.aborted).toBe(true);
    await act(async () => finish(Response.json({ listings: [listing(1)] })));
    expect(container.textContent).toBe("");
    await advance(8000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
