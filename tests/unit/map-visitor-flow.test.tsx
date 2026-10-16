import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MapListing } from "@/components/listings/caribbean-map";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("next/dynamic", () => ({ default: () => ({ listings, activeIsland }: { listings: MapListing[]; activeIsland: string }) => React.createElement("div", { "data-map": true, "data-island": activeIsland }, listings.map(listing => React.createElement("p", { key: listing.id }, listing.title))) }));
import MapPage from "@/app/(platform)/map/page";

const fixture = (title: string, islandSlug = "grenada"): MapListing => ({ id: title, title, slug: "synthetic-listing", type: "tour", priceAmount: null, priceCurrency: "USD", bookingEligible: false, priceUnit: null, avgRating: null, reviewCount: 0, parish: null, islandSlug, islandName: islandSlug, image: null, isFeatured: false, latitude: "12.1", longitude: "-61.7" });
const response = (listings: MapListing[], nextCursor: string | null = null, totalCount: number | null = listings.length) => Response.json({ listings, nextCursor, totalCount });
function deferred() { let finish!: (value: Response) => void; return { promise: new Promise<Response>(resolve => { finish = resolve; }), resolve: (value: Response) => finish(value) }; }
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<MapPage />)); }
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === text)!;
async function click(text: string) { expect(button(text), text).toBeDefined(); await act(async () => button(text).click()); }

it("hides previous pins while an island loads and rejects the older island after a newer response even when fetch ignores abort", async () => {
  const old = deferred(), current = deferred();
  fetchMock.mockResolvedValueOnce(response([fixture("Initial pin")])).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await render(); expect(container.textContent).toContain("Initial pin");
  await click("Grenada"); expect(container.querySelector("[data-map]")).toBeNull(); expect(container.querySelector('[role="region"]')?.getAttribute("aria-busy")).toBe("true");
  await click("Barbados"); expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => current.resolve(response([fixture("Current Barbados", "barbados")])));
  await act(async () => old.resolve(response([fixture("Obsolete Grenada")])));
  expect(container.querySelector("[data-map]")?.getAttribute("data-island")).toBe("barbados");
  expect(container.textContent).toContain("Current Barbados"); expect(container.textContent).not.toContain("Obsolete Grenada");
  expect(button("Barbados").getAttribute("aria-pressed")).toBe("true");
});

it("rejects an obsolete All Islands response after leaving and returning to that same island context", async () => {
  const old = deferred();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([fixture("Grenada pin")])).mockResolvedValueOnce(response([fixture("Fresh overview", "barbados")]));
  await render(); await click("Grenada"); await click("All Islands");
  await act(async () => old.resolve(response([fixture("Obsolete overview")])));
  expect(container.textContent).toContain("Fresh overview"); expect(container.textContent).not.toContain("Obsolete overview");
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

it.each(["HTTP", "network", "malformed"])("shows an honest %s failure and retries the selected island without claiming zero listings", async kind => {
  fetchMock.mockResolvedValueOnce(response([fixture("Initial pin")]));
  if (kind === "HTTP") fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
  else if (kind === "network") fetchMock.mockRejectedValueOnce(new Error("Synthetic network failure"));
  else fetchMock.mockResolvedValueOnce(Response.json({ listings: [null] }));
  fetchMock.mockResolvedValueOnce(response([fixture("Recovered Barbados", "barbados")]));
  await render(); await click("Barbados");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be loaded");
  expect(container.textContent).not.toContain("0 mapped listings"); expect(container.textContent).not.toContain("No map locations"); expect(container.querySelector("[data-map]")).toBeNull();
  await click("Try loading map listings again");
  expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.textContent).toContain("Recovered Barbados");
  expect(fetchMock.mock.calls[2][0]).toContain("island=barbados"); expect(fetchMock.mock.calls.every(call => call[1].cache === "no-store")).toBe(true);
});

it("distinguishes a successful empty map scope from failures with readable map status", async () => {
  fetchMock.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]));
  await render(); expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.textContent).toContain("No map locations are available for these listings");
  await click("Grenada"); expect(container.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe("Grenada listing map");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("No map locations are available for Grenada");
  expect(container.querySelector("[data-map]")).toBeNull(); expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("bounds an abort-ignoring stalled request and ignores its late success after the visitor retries", async () => {
  vi.useFakeTimers(); const old = deferred();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([fixture("Retry succeeded")]));
  await render(); await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await click("Try loading map listings again");
  await act(async () => old.resolve(response([fixture("Late timeout result")])));
  expect(container.textContent).toContain("Retry succeeded"); expect(container.textContent).not.toContain("Late timeout result");
});

it("aborts a pending read on disposal and never starts a follow-up request", async () => {
  const pending = deferred(); fetchMock.mockReturnValueOnce(pending.promise);
  await render(); await act(async () => root.render(<p>Left map</p>));
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => pending.resolve(response([fixture("Late unmount result")])));
  expect(container.textContent).toBe("Left map"); expect(fetchMock).toHaveBeenCalledTimes(1);
});

const pin = (number: number): MapListing => ({ ...fixture(`Pin ${number}`, `destination-${number % 34}`), id: `00000000-0000-0000-0000-${number.toString(16).padStart(12, "0")}` });

it("progressively displays the first page while later pages load and preserves it if a later page fails", async () => {
  const pending = deferred();
  const first = Array.from({ length: 250 }, (_, index) => pin(index + 1));
  fetchMock.mockResolvedValueOnce(response(first, first.at(-1)!.id, 8038)).mockReturnValueOnce(pending.promise);
  await render();
  expect(container.querySelector("[data-map]")).not.toBeNull();
  expect(container.querySelectorAll("[data-map] p")).toHaveLength(250);
  expect(container.textContent).toContain("250 locations loaded");
  expect(container.querySelector('[role="region"]')?.getAttribute("aria-busy")).toBe("true");
  await act(async () => pending.resolve(Response.json({ error: "Synthetic later page failure" }, { status: 503 })));
  expect(container.querySelectorAll("[data-map] p")).toHaveLength(250);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("already loaded are still available");
  expect(container.textContent).not.toContain("250 mapped listings");
});

it("loads all8038 locations across34 destinations in nine bounded directory pages", async () => {
  const all = Array.from({ length: 8038 }, (_, index) => pin(index + 1));
  fetchMock.mockImplementation(async (url: string) => {
    const params = new URL(url, "https://vakaygo.test").searchParams;
    const cursor = params.get("cursor");
    const start = cursor ? parseInt(cursor.slice(-12), 16) : 0;
    const rows = all.slice(start, start + (cursor ? 1000 : 250));
    return response(rows, start + rows.length < all.length ? rows.at(-1)!.id : null, cursor ? null : all.length);
  });
  await render();
  expect(fetchMock).toHaveBeenCalledTimes(9);
  expect(fetchMock.mock.calls.every(([url]) => url.startsWith("/api/map/listings?") && !url.includes("limit="))).toBe(true);
  expect(container.querySelectorAll("[data-map] p")).toHaveLength(8038);
  expect(container.textContent).toContain("8038 mapped listings");
  expect(container.querySelector('[role="region"]')?.getAttribute("aria-busy")).toBe("false");
  expect(new Set(all.map(row => row.islandSlug)).size).toBe(34);
});

it("rejects a repeated paging cursor instead of reporting a truncated map as complete", async () => {
  const row = pin(1);
  fetchMock.mockResolvedValue(response([row], row.id, 1000));
  await render();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelectorAll("[data-map] p")).toHaveLength(1);
  expect(container.textContent).not.toContain("1 mapped listings");
});
