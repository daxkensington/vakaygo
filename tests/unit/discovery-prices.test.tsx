import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CurrencyProvider } from "@/lib/currency";
import { addRecentlyViewed, getRecentlyViewed, type RecentListing } from "@/lib/recently-viewed";
import { RecentlyViewed } from "@/components/listings/recently-viewed";
import { ListingCard } from "@/components/listings/listing-card";
import { BookingWidget } from "@/components/listings/booking-widget";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/lib/use-saved", () => ({ useSaved: () => ({ isSaved: () => false, toggle() {}, pendingIds: new Set(), loading: false }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, refresh: async () => {} }) }));
vi.mock("@/components/listings/booking-eligibility", () => ({ BookingEligibilityGate: ({ children }: { children: React.ReactNode }) => children, invalidateBookingControls() {} }));

const stored: RecentListing = { id: "00000000-0000-0000-0000-000000000001", title: "Recent EUR fixture", slug: "recent", type: "tour", priceAmount: "350", priceUnit: "trip", islandSlug: "santorini", image: null };
const rates = { USD: 1, EUR: 0.8, CAD: 1.6 };
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("vakaygo_currency", "CAD");
  localStorage.setItem("vakaygo_exchange_rates", JSON.stringify({ rates, updatedAt: Date.now(), source: "synthetic" }));
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); });
async function render(child: React.ReactNode) { await act(async () => root.render(<CurrencyProvider>{child}</CurrencyProvider>)); }

it("keeps legacy history while suppressing stored prices before confirmation and after unavailable eligibility", async () => {
  localStorage.setItem("vakaygo_recently_viewed", JSON.stringify([stored]));
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
  expect(getRecentlyViewed()[0].priceAmount).toBeNull();
  await render(<RecentlyViewed />);
  expect(container.textContent).toContain(stored.title); expect(container.textContent).not.toContain("350");
  await act(async () => finish(Response.json({ listings: [{ id: stored.id, priceAmount: "350", priceCurrency: "USD", priceUnit: "trip", bookingEligible: false }] })));
  expect(container.textContent).toContain("Information only"); expect(container.textContent).not.toContain("350");
});

it("uses a fresh eligible source-currency price rather than the old stored amount", async () => {
  localStorage.setItem("vakaygo_recently_viewed", JSON.stringify([stored]));
  fetchMock.mockResolvedValue(Response.json({ listings: [{ id: stored.id, priceAmount: "100", priceCurrency: "EUR", priceUnit: "trip", bookingEligible: true }] }));
  await render(<RecentlyViewed />);
  expect(container.textContent).toContain("CA$200.00"); expect(container.textContent).not.toContain("350");
  expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
});

it("removes a previously confirmed recent price while refreshing and ignores a late obsolete request", async () => {
  localStorage.setItem("vakaygo_recently_viewed", JSON.stringify([stored]));
  fetchMock.mockResolvedValueOnce(Response.json({ listings: [{ id: stored.id, priceAmount: "100", priceCurrency: "EUR", priceUnit: "trip", bookingEligible: true }] }));
  await render(<RecentlyViewed />); expect(container.textContent).toContain("CA$200.00");
  let finishOld!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => { finishOld = resolve; }));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).not.toContain("CA$200.00");
  fetchMock.mockResolvedValueOnce(Response.json({ listings: [{ id: stored.id, priceAmount: null, priceCurrency: "EUR", priceUnit: "trip", bookingEligible: false }] }));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => finishOld(Response.json({ listings: [{ id: stored.id, priceAmount: "999", priceCurrency: "USD", priceUnit: "trip", bookingEligible: true }] })));
  expect(container.textContent).toContain("Information only"); expect(container.textContent).not.toContain("999");
});

it("stores descriptive history only and tolerates corrupted legacy storage", () => {
  addRecentlyViewed(stored);
  expect(JSON.parse(localStorage.getItem("vakaygo_recently_viewed")!)[0]).toMatchObject({ priceAmount: null, priceUnit: null, title: stored.title });
  localStorage.setItem("vakaygo_recently_viewed", JSON.stringify({ invalid: true })); expect(getRecentlyViewed()).toEqual([]);
  localStorage.setItem("vakaygo_recently_viewed", JSON.stringify([null, 42, stored])); expect(getRecentlyViewed()).toHaveLength(1);
});

it("converts a EUR card into the selected CAD currency using its source currency", async () => {
  await render(<ListingCard {...stored} priceAmount="100" priceCurrency="EUR" islandName="Santorini" avgRating={null} reviewCount={0} parish={null} isFeatured={false} bookingEligible />);
  expect(container.textContent).toContain("CA$200.00"); expect(container.textContent).not.toContain("CA$160.00");
});

it("converts the booking headline from EUR and labels its source-currency breakdown accurately", async () => {
  await render(<BookingWidget bookingEligible listing={{ id: stored.id, type: "tour", priceAmount: "100", priceCurrency: "EUR", priceUnit: "person", avgRating: null, reviewCount: 0, isInstantBook: false }} />);
  expect(container.textContent).toContain("CA$200.00"); expect(container.textContent).toContain("Price breakdown (EUR)");
  expect(container.textContent).toContain("€100.00"); expect(container.textContent).not.toContain("charged in USD");
});
