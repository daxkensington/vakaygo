import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/dynamic", () => ({ default: () => () => <div>Map</div> }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/ui/breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/components/listings/recently-viewed", () => ({ RecentlyViewed: () => null }));
vi.mock("@/components/listings/listing-card", () => ({ ListingCard: ({ title }: { title: string }) => <div data-listing>{title}</div> }));
vi.mock("@/lib/analytics", () => ({ analytics: { search: vi.fn() } }));
vi.mock("@/components/search/search-autocomplete", () => ({ SearchAutocomplete: ({ value, onChange, onEnter, onFocus, onBlur }: { value: string; onChange: (query: string) => void; onEnter: (query: string) => void; onFocus: () => void; onBlur: () => void }) => <input aria-label="Search" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onEnter(value); }} onFocus={onFocus} onBlur={onBlur} /> }));
import { ExploreClient, type ExploreInitial } from "@/app/(platform)/explore/explore-client";
import { parseListingFilters, type ListingResult } from "@/lib/listing-filters";

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function listing(number: number): ListingResult { return { id: `listing-${number}`, title: `Listing ${number}`, slug: `listing-${number}`, type: "tour", headline: null, priceAmount: null, priceCurrency: null, priceUnit: null, avgRating: null, reviewCount: null, parish: null, isFeatured: false, islandSlug: "grenada", islandName: "Grenada", latitude: null, longitude: null, image: null, reviewSource: "google" }; }
const cards = Array.from({ length: 24 }, (_, index) => listing(index));
const initial = (overrides: Partial<ExploreInitial> = {}): ExploreInitial => ({ filters: parseListingFilters(new URLSearchParams()), listings: cards, totalCount: 48, islandName: null, heading: "Explore Caribbean experiences", loaded: true, ...overrides });
async function render(value = initial()) { await act(async () => { root.render(<ExploreClient initial={value} />); }); }
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(350); }); };
const button = (text: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === text)!;
async function click(text: string) { await act(async () => { button(text).click(); }); }
async function change(input: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
beforeEach(() => {
  auth.user = null; auth.loading = false;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async (url: string) => url.startsWith("/api/search-history") ? response(auth.user ? { userId: auth.user.id, searches: [{ id: 1, userId: auth.user.id, query: "boat", filters: null }] } : { searches: [] }) : url.startsWith("/api/listings/count") ? response({ count: 1 }) : response({ listings: [listing(30)] }));
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/explore");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("explains unavailable online date inventory and removes only the date to recover directory browsing", async () => {
  await render(initial({ filters: parseListingFilters(new URLSearchParams("date=2099-12-02&type=spa&island=grenada&q=massage&sort=rating")), listings: [], totalCount: 0 }));
  expect(container.textContent).toContain("No online availability for this date");
  expect(container.textContent).toContain("Directory businesses may still be available");
  expect(container.textContent).not.toContain("No listings found");
  await click("Browse without a date"); await tick();
  const request = fetchMock.mock.calls.find(([url]) => url.startsWith("/api/listings?"))![0];
  const query = new URL(request, "https://vakaygo.com").searchParams;
  expect(query.get("date")).toBeNull(); expect(query.get("type")).toBe("spa"); expect(query.get("island")).toBe("grenada"); expect(query.get("q")).toBe("massage"); expect(query.get("sort")).toBe("rating");
  expect(container.querySelectorAll("[data-listing]")).toHaveLength(1);
});

it("keeps confirmed empty directory results distinct from unavailable online date inventory", async () => {
  await render(initial({ listings: [], totalCount: 0 }));
  expect(container.textContent).toContain("No listings found"); expect(container.textContent).not.toContain("No online availability for this date");
});

it("keeps the server-rendered first page without refetching or offering an extra exact-size page", async () => {
  await render(initial({ totalCount: 24 })); await tick();
  expect(container.querySelectorAll("[data-listing]")).toHaveLength(24);
  expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/listings"))).toBe(false);
  expect(Array.from(container.querySelectorAll("button")).some((item) => item.textContent === "Load More")).toBe(false);
});

it("blocks duplicate pagination and retries the same failed page while preserving visible cards", async () => {
  let resolvePage!: (value: Response) => void;
  fetchMock.mockImplementation((url: string) => url.startsWith("/api/search-history") ? Promise.resolve(response({ searches: [] })) : new Promise<Response>((resolve) => { resolvePage = resolve; }));
  await render(); await click("Load More"); await tick();
  expect(button("Loading...").disabled).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/listings?"))).toHaveLength(1);
  await act(async () => { resolvePage(response({ error: "unavailable" }, 500)); });
  expect(container.querySelectorAll("[data-listing]")).toHaveLength(24);
  expect(container.textContent).toContain("Your results are still here");
  await click("Try again"); await tick();
  const requests = fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/listings?"));
  expect(requests).toHaveLength(2);
  expect(requests.every(([url]) => new URL(url, "https://vakaygo.com").searchParams.get("offset") === "24")).toBe(true);
  await act(async () => { resolvePage(response({ listings: [listing(30)] })); });
  expect(container.querySelectorAll("[data-listing]")).toHaveLength(25);
});

it("restores the initial filter after another filter's pending requests without treating cleared data as loaded", async () => {
  const pending: Array<(value: Response) => void> = [];
  fetchMock.mockImplementation((url: string) => url.startsWith("/api/search-history") ? Promise.resolve(response({ searches: [] })) : new Promise<Response>((resolve) => pending.push(resolve)));
  await render(); await click("Tours"); await tick();
  await click("All"); await tick();
  const requests = fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/listings?"));
  expect(requests).toHaveLength(2);
  expect(new URL(requests[1][0], "https://vakaygo.com").searchParams.get("type")).toBeNull();
  await act(async () => { pending[2](response({ count: 2 })); pending[3](response({ listings: [listing(31), listing(32)] })); });
  expect(container.querySelectorAll("[data-listing]")).toHaveLength(2);
  expect(container.textContent).toContain("of 2");
  await act(async () => { pending[0](response({ count: 99 })); pending[1](response({ listings: [listing(99)] })); });
  expect(container.textContent).not.toContain("Listing 99");
  expect(container.textContent).toContain("of 2");
});

it("reports failed lists and unknown counts as errors and recovers with the same query", async () => {
  fetchMock.mockImplementation(async (url: string) => url.startsWith("/api/search-history") ? response({ searches: [] }) : response({ error: "unavailable" }, 500));
  await render(initial({ loaded: false, listings: [], totalCount: 0 })); await tick();
  expect(container.textContent).toContain("Listings couldn't load");
  expect(container.textContent).toContain("an unavailable total");
  expect(container.textContent).not.toContain("No listings found");
  fetchMock.mockImplementation(async (url: string) => url.startsWith("/api/listings/count") ? response({ count: 1 }) : response({ listings: [listing(30)] }));
  await click("Try again"); await tick();
  expect(container.querySelectorAll("[data-listing]")).toHaveLength(1);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("of 1");
});

it("updates headings and clears hidden cuisine when changing categories while preserving island/search/sort", async () => {
  await render(initial({ filters: parseListingFilters(new URLSearchParams("type=dining&island=grenada&q=boat&cuisine=seafood&sort=rating")), islandName: "Grenada", heading: "Dining in Grenada" }));
  await click("Tours"); await tick();
  expect(container.querySelector("h1")!.textContent).toBe("Tours in Grenada");
  expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Grid");
  expect(Array.from(container.querySelectorAll('button[aria-pressed="true"]')).some((item) => item.textContent?.trim() === "Tours")).toBe(true);
  const request = fetchMock.mock.calls.find(([url]) => url.startsWith("/api/listings?"))![0];
  const query = new URL(request, "https://vakaygo.com").searchParams;
  expect(query.get("cuisine")).toBeNull(); expect(query.get("island")).toBe("grenada"); expect(query.get("q")).toBe("boat"); expect(query.get("sort")).toBe("rating");
});

it("lets native keyboard click activate recent searches", async () => {
  auth.user = { id: "search-history-traveler" };
  await render(); const search = container.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  await act(async () => { search.focus(); });
  expect(fetchMock.mock.calls.some(([url]) => url === "/api/search-history?expectedUserId=search-history-traveler")).toBe(true);
  expect(button("boat").type).toBe("button");
  await click("boat"); await tick();
  expect(search.value).toBe("boat");
  expect(fetchMock.mock.calls.some(([url]) => url.includes("q=boat"))).toBe(true);
});

it("rejects late smart-search filters after the visitor changes the query", async () => {
  let resolveAi!: (value: Response) => void;
  fetchMock.mockImplementation((url: string) => url === "/api/ai/smart-search" ? new Promise<Response>((resolve) => { resolveAi = resolve; }) : Promise.resolve(url.startsWith("/api/search-history") ? response({ searches: [] }) : url.startsWith("/api/listings/count") ? response({ count: 1 }) : response({ listings: [listing(30)] })));
  await render(); const search = container.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  await change(search, "romantic dinner");
  await act(async () => { search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  await change(search, "boat");
  await act(async () => { resolveAi(response({ filters: { type: "dining", island: "jamaica", q: "dinner" }, summary: "Old dinner suggestions", suggestions: [] })); });
  await tick();
  expect(search.value).toBe("boat"); expect(container.textContent).not.toContain("Old dinner suggestions");
  expect(container.querySelector("h1")!.textContent).toBe("Explore Caribbean experiences");
});

it("clears the original sentence when AI selects a category without keyword filtering", async () => {
  fetchMock.mockImplementation(async (url: string) => url === "/api/ai/smart-search"
    ? response({ filters: { type: "tour" }, summary: "Directory tours for planning.", suggestions: [] })
    : url.startsWith("/api/search-history") ? response({ searches: [] })
    : url.startsWith("/api/listings/count") ? response({ count: 1 })
    : response({ listings: [listing(30)] }));
  await render();
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search"]')!;
  await change(input, "Find the best tours for a family"); await tick();
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await tick();
  const last = fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/listings?")).at(-1)![0];
  const params = new URL(last, "https://vakaygo.com").searchParams;
  expect(params.get("type")).toBe("tour"); expect(params.get("q")).toBeNull();
  expect(input.value).toBe(""); expect(container.textContent).toContain("Listing 30");
  expect(container.textContent).toContain("Directory tours for planning.");
});

async function relatedSuggestion(suggestion: string) {
  let calls = 0;
  fetchMock.mockImplementation(async (url: string) => url === "/api/ai/smart-search"
    ? response(++calls === 1
      ? { filters: { type: "dining", q: "dinner" }, summary: "Directory dining.", suggestions: [suggestion] }
      : { filters: { type: "tour" }, summary: "Parsed tour intent.", suggestions: [] })
    : url.startsWith("/api/search-history") ? response({ searches: [] })
    : url.startsWith("/api/listings/count") ? response({ count: 1 })
    : response({ listings: [listing(30)] }));
  await render();
  const search = container.querySelector<HTMLInputElement>('input[aria-label="Search"]')!;
  await change(search, "best dinner");
  await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(button(suggestion)).toBeDefined();
  await click(suggestion);
  return search;
}

it("parses a short Related suggestion after its cleared filters settle instead of searching the whole phrase", async () => {
  const search = await relatedSuggestion("Find tours");
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/ai/smart-search")).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  const smartCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/ai/smart-search");
  expect(smartCalls).toHaveLength(2);
  expect(JSON.parse(smartCalls[1][1].body).query).toBe("Find tours");
  expect(search.value).toBe(""); expect(container.textContent).toContain("Parsed tour intent.");
  // React commits the parsed filters after the queued callback's act phase;
  // let their separate listing-fetch effect run before checking the URL.
  await tick();
  const last = fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/listings?")).at(-1)![0];
  const params = new URL(last, "https://vakaygo.com").searchParams;
  expect(params.get("type")).toBe("tour"); expect(params.get("q")).toBeNull();
});

it.each(["query", "category"])("cancels a queued Related parse when the visitor changes the %s before it starts", async changeKind => {
  const search = await relatedSuggestion("Find the best family tours");
  if (changeKind === "query") await change(search, "boat");
  else await click("Stays");
  await tick();
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/ai/smart-search")).toHaveLength(1);
  expect(container.textContent).not.toContain("Parsed tour intent.");
  expect(search.value).toBe(changeKind === "query" ? "boat" : "Find the best family tours");
  if (changeKind === "category") expect(container.querySelector("h1")!.textContent).toBe("Stays in the Caribbean");
});

it("does not start a queued Related parse after Explore unmounts", async () => {
  await relatedSuggestion("Find the best family tours");
  await act(async () => root.render(<div>Another page</div>));
  await tick();
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/ai/smart-search")).toHaveLength(1);
});

it("starts a natural-language history parse only after the selected query is current", async () => {
  auth.user = { id: "search-history-traveler" };
  const term = "romantic dinner";
  fetchMock.mockImplementation(async (url: string) => url === "/api/ai/smart-search"
    ? response({ filters: { type: "dining", q: "dinner" }, summary: "Current dinner intent.", suggestions: [] })
    : url.startsWith("/api/search-history") ? response({ userId: auth.user!.id, searches: [{ id: 1, userId: auth.user!.id, query: term, filters: null }] })
    : url.startsWith("/api/listings/count") ? response({ count: 1 })
    : response({ listings: [listing(30)] }));
  await render(); const search = container.querySelector<HTMLInputElement>('input[aria-label="Search"]')!;
  await act(async () => search.focus());
  await click(term); await tick();
  const smartCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/ai/smart-search");
  expect(smartCalls).toHaveLength(1); expect(JSON.parse(smartCalls[0][1].body).query).toBe(term);
  expect(search.value).toBe("dinner"); expect(container.textContent).toContain("Current dinner intent.");
});

it("opens a labelled native filter dialog and returns focus to its trigger on Escape", async () => {
  await render(); const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open filters"]')!;
  await act(async () => { trigger.focus(); trigger.click(); }); await tick();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog).not.toBeNull(); expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Filters");
  expect(dialog.contains(document.activeElement)).toBe(true);
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
});

it("identifies USD estimates consistently in desktop filters, chips, sorting and mobile filters", async () => {
  await render(initial({ filters: parseListingFilters(new URLSearchParams("minPrice=100&maxPrice=120&sort=price-asc")) }));
  expect(container.querySelector<HTMLInputElement>('[aria-label="Minimum price in USD"]')?.placeholder).toBe("Min USD");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Maximum price in USD"]')?.placeholder).toBe("Max USD");
  expect(container.textContent).toContain("Min USD $100"); expect(container.textContent).toContain("Max USD $120");
  expect(container.querySelector('option[value="price-asc"]')?.textContent).toContain("USD estimate");
  expect(container.textContent).toContain("Price filters and sorting use USD estimates");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open filters"]')!.click()); await tick();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Price Range (USD estimates)"); expect(dialog.textContent).toContain("Filters use USD estimates");
  expect(dialog.querySelector<HTMLInputElement>('[aria-label="Minimum price in USD"]')?.value).toBe("100");
  expect(dialog.querySelector<HTMLInputElement>('[aria-label="Maximum price in USD"]')?.value).toBe("120");
});
