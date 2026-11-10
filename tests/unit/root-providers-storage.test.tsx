import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/grenada" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import { PromoBanner, promoBannerAllowed } from "@/components/layout/promo-banner";
import { CurrencyProvider, useCurrency } from "@/lib/currency";

let root: Root, container: HTMLDivElement;
const blockedStorage = () => {
  const refuse = () => { throw new DOMException("The operation is insecure.", "SecurityError"); };
  vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse, key: refuse, length: 0 });
};
beforeEach(() => {
  nav.pathname = "/grenada";
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rates: { USD: 1, EUR: 0.9 }, updatedAt: 1, source: "test" }))));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("trip planner announcement", () => {
  it("stays off the pages where it interrupts or repeats itself", () => {
    for (const path of ["/", "/auth/signin", "/auth/signup", "/trips", "/trips/new", "/operator", "/operator/listings/1", "/admin/revenue", "/bookings", "/checkout/abc"]) {
      expect(promoBannerAllowed(path)).toBe(false);
    }
    for (const path of ["/explore", "/grenada", "/grenada/eco-dive", "/islands", "/authors", "/tripsy"]) {
      expect(promoBannerAllowed(path)).toBe(true);
    }
    expect(promoBannerAllowed(null)).toBe(false);
  });

  it("says an account is needed and links straight to the planner", async () => {
    localStorage.clear();
    await act(async () => root.render(<PromoBanner />));
    expect(container.textContent).toContain("free with a VakayGo account");
    expect(container.textContent).not.toMatch(/Caribbean/);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/trips/new");
  });

  it("renders nothing on a sign-in page", async () => {
    nav.pathname = "/auth/signin";
    await act(async () => root.render(<PromoBanner />));
    expect(container.innerHTML).toBe("");
  });

  it("survives blocked storage, both showing and dismissing", async () => {
    blockedStorage();
    await act(async () => root.render(<PromoBanner />));
    expect(container.textContent).toContain("AI Trip Planner");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss banner"]')!.click());
    expect(container.innerHTML).toBe("");
  });
});

describe("currency provider", () => {
  function Probe() {
    const { currency, setCurrency } = useCurrency();
    return <button onClick={() => setCurrency("EUR")}>{currency}</button>;
  }

  it("keeps every page alive when storage access throws", async () => {
    blockedStorage();
    await act(async () => root.render(<CurrencyProvider><Probe /></CurrencyProvider>));
    expect(container.textContent).toBe("USD");
    await act(async () => container.querySelector("button")!.click());
    // The choice applies for this visit even though it cannot be remembered.
    expect(container.textContent).toBe("EUR");
  });
});
