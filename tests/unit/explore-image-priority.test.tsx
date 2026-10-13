import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({ default: () => () => <div>Map</div> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/ui/breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/components/listings/recently-viewed", () => ({ RecentlyViewed: () => null }));
vi.mock("@/lib/use-saved", () => ({ useSaved: () => ({ isSaved: () => false, toggle: vi.fn(), pendingIds: new Set(), loading: false }) }));
vi.mock("@/lib/currency", () => ({ useCurrency: () => ({ format: (amount: number) => `$${amount}` }) }));
vi.mock("@/lib/analytics", () => ({ analytics: { search: vi.fn() } }));
vi.mock("@/components/search/search-autocomplete", () => ({ SearchAutocomplete: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Search" value={value} onChange={event => onChange(event.target.value)} /> }));
import { ExploreClient, type ExploreInitial } from "@/app/(platform)/explore/explore-client";
import { ListingCard } from "@/components/listings/listing-card";
import { parseListingFilters, type ListingResult } from "@/lib/listing-filters";

let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown) => new Response(JSON.stringify(body));
const listing = (index: number, optimized = false): ListingResult => ({ id: `priority-${index}`, title: `Priority fixture ${index}`, slug: `priority-${index}`, type: "tour", headline: null, priceAmount: null, priceCurrency: null, priceUnit: null, avgRating: null, reviewCount: null, parish: null, isFeatured: false, islandSlug: "grenada", islandName: "Grenada", latitude: null, longitude: null, image: optimized ? `/optimized-priority-${index}.jpg` : `https://example.invalid/native-priority-${index}.jpg`, reviewSource: "google" });
const initial = (optimized = false, totalCount = 24): ExploreInitial => ({ filters: parseListingFilters(new URLSearchParams()), listings: Array.from({ length: 24 }, (_, index) => listing(index, optimized)), totalCount, islandName: null, heading: "Explore Caribbean experiences", loaded: true });
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
const images = () => Array.from(container.querySelectorAll<HTMLImageElement>("img"));
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === label)!;
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(350); }); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async (url: string) => url.startsWith("/api/search-history") ? response({ history: [] }) : response({ listings: Array.from({ length: 24 }, (_, index) => listing(index + 24)) }));
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/explore");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("renders actual grid/card/native images with the first four eager/high and the remaining20 lazy", async () => {
  await render(<ExploreClient initial={initial()} />);
  expect(images()).toHaveLength(24);
  expect(images().map(image => image.getAttribute("loading"))).toEqual([...Array(4).fill("eager"), ...Array(20).fill("lazy")]);
  expect(images().map(image => image.getAttribute("fetchpriority"))).toEqual([...Array(4).fill("high"), ...Array(20).fill("auto")]);
  expect(images()[0].getAttribute("alt")).toBe("Priority fixture 0");
  expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/listings"))).toBe(false);
});

it("passes bounded priority through the actual optimized Next image branch without making the rest eager", async () => {
  await render(<ExploreClient initial={initial(true)} />);
  expect(images()).toHaveLength(24);
  expect(images().every(image => image.hasAttribute("data-nimg"))).toBe(true);
  expect(images().map(image => image.getAttribute("loading"))).toEqual([...Array(4).fill("eager"), ...Array(20).fill("lazy")]);
  expect(images().map(image => image.getAttribute("fetchpriority"))).toEqual([...Array(4).fill("high"), ...Array(20).fill("auto")]);
  const preloads = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')).filter(link => link.getAttribute("imagesrcset")?.includes("optimized-priority"));
  expect(preloads).toHaveLength(4);
});

it("keeps newly paginated cards lazy and the original four prioritized", async () => {
  await render(<ExploreClient initial={initial(false, 48)} />);
  await act(async () => button("Load More").click()); await tick();
  expect(images()).toHaveLength(48);
  expect(images().filter(image => image.getAttribute("loading") === "eager")).toHaveLength(4);
  expect(images().slice(24).every(image => image.getAttribute("loading") === "lazy" && image.getAttribute("fetchpriority") === "auto")).toBe(true);
});

it("prioritizes one map-panel card and restores the bounded grid row on return", async () => {
  await render(<ExploreClient initial={initial()} />);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Map view"]')!.click());
  expect(images()).toHaveLength(24);
  expect(images().filter(image => image.getAttribute("loading") === "eager")).toHaveLength(1);
  expect(images()[0].getAttribute("fetchpriority")).toBe("high");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Grid view"]')!.click());
  expect(images().filter(image => image.getAttribute("loading") === "eager")).toHaveLength(4);
});

it("leaves other card consumers lazy unless they explicitly request priority", async () => {
  await render(<ListingCard {...listing(0)} />);
  expect(images()[0].getAttribute("loading")).toBe("lazy"); expect(images()[0].getAttribute("fetchpriority")).toBe("auto");
  expect(container.textContent).toContain("Information only · Online booking unavailable");
  await render(<ListingCard {...listing(0)} priority />);
  expect(images()[0].getAttribute("loading")).toBe("eager"); expect(images()[0].getAttribute("fetchpriority")).toBe("high");
});
