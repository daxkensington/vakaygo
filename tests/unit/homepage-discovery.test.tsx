import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    void prefetch;
    return React.createElement("a", props, children);
  },
}));
vi.mock("next/image", () => ({
  default: ({ fill, priority, quality, ...props }: React.ComponentProps<"img"> & { fill?: boolean; priority?: boolean; quality?: number }) => {
    void fill; void priority; void quality;
    return React.createElement("img", props);
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

import LandingPage from "@/app/page";

// Preserve the published discovery destinations independently of the component's
// data: a shorter homepage must not quietly remove an existing entry point.
const categories = [
  ["stay", "Stays"], ["excursion", "Excursions"], ["tour", "Tours"],
  ["dining", "Dining"], ["event", "Events"], ["transfer", "Airport Transfers"],
  ["transport", "Transport"], ["vip", "VIP Services"], ["guide", "Guides"],
  ["spa", "Spa & Wellness"],
] as const;
const destinationSlugs = [
  "grenada", "dominican-republic", "puerto-rico", "jamaica", "st-lucia",
  "guadeloupe", "bahamas", "us-virgin-islands", "martinique",
  "trinidad-and-tobago", "aruba", "barbados", "curacao", "antigua",
  "turks-and-caicos", "bonaire", "cayman-islands", "st-vincent", "st-kitts",
  "dominica", "british-virgin-islands", "cancun-riviera-maya", "ambergris-caye",
  "los-cabos", "guanacaste", "medellin", "cartagena", "mykonos", "crete",
  "santorini", "ibiza", "mallorca", "amalfi-coast-capri", "hvar-split",
];
const featuredSlugs = ["grenada", "st-lucia", "barbados", "cartagena", "santorini", "amalfi-coast-capri"];
let homepage: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("React", React);
  homepage = document.createElement("div");
  // Use the real page composition. No hydration, effects or API response is
  // needed for category links, every destination, or material limitations.
  homepage.innerHTML = renderToStaticMarkup(<LandingPage />);
});
afterEach(() => { vi.unstubAllGlobals(); });

function section(id: string): HTMLElement {
  const element = homepage.querySelector<HTMLElement>(`#${id}`);
  expect(element, `missing homepage anchor #${id}`).not.toBeNull();
  return element!;
}
function hrefs(element: ParentNode): string[] {
  return Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"), link => link.getAttribute("href")!);
}
function expectPublishedText(element: HTMLElement, text: string) {
  const paragraph = Array.from(element.querySelectorAll("p"))
    .find(candidate => candidate.textContent?.includes(text));
  expect(paragraph, `missing disclosure: ${text}`).toBeDefined();
  expect(paragraph!.closest("details:not([open]), [hidden]")).toBeNull();
}

describe("compact homepage discovery", () => {
  it("server-renders a named category link for every existing listing type", () => {
    const links = section("categories").querySelectorAll<HTMLAnchorElement>("a[href]");
    expect(links).toHaveLength(10);
    for (const [type, label] of categories) {
      const link = Array.from(links).find(candidate => candidate.getAttribute("href") === `/explore?type=${type}`);
      expect(link, `missing ${label} discovery link`).toBeDefined();
      expect(link!.textContent).toContain(label);
      expect(link!.closest("details:not([open]), [hidden]")).toBeNull();
    }
  });

  it("keeps all 34 original destination routes in server-rendered HTML", () => {
    const destinations = section("destinations");
    const destinationLinks = Array.from(destinations.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .filter(link => link.getAttribute("href") !== "/islands");
    expect(destinationLinks.map(link => link.getAttribute("href")).sort())
      .toEqual(destinationSlugs.map(slug => `/${slug}`).sort());
    for (const link of destinationLinks) {
      expect(link.textContent!.trim(), `unnamed link ${link.getAttribute("href")}`).not.toBe("");
    }
  });

  it("offers six destinations immediately and 28 more in a native disclosure, with a separate directory link", () => {
    const destinations = section("destinations");
    const disclosure = destinations.querySelector("details")!;
    expect(disclosure).not.toBeNull();
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector(":scope > summary")?.textContent).toMatch(/28 more destinations/i);
    expect(hrefs(disclosure).sort()).toEqual(destinationSlugs.filter(slug => !featuredSlugs.includes(slug)).map(slug => `/${slug}`).sort());

    const immediateLinks = Array.from(destinations.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .filter(link => !disclosure.contains(link));
    expect(immediateLinks.filter(link => link.getAttribute("href") !== "/islands").map(link => link.getAttribute("href")).sort())
      .toEqual(featuredSlugs.map(slug => `/${slug}`).sort());
    const directoryLink = immediateLinks.find(link => link.getAttribute("href") === "/islands");
    expect(directoryLink?.textContent).toMatch(/all 34 destinations/i);
  });

  it("retains the existing section anchors and useful map, planner, signup and business routes", () => {
    const main = homepage.querySelector("main")!;
    for (const id of ["categories", "how-it-works", "for-businesses", "join"]) {
      expect(homepage.querySelectorAll(`#${id}`)).toHaveLength(1);
      expect(main.contains(section(id))).toBe(true);
      expect(section(id).textContent!.trim()).not.toBe("");
    }
    for (const [href, label] of [
      ["/map", /3D.*Map/i], ["/trips/new", /AI Itinerary/i],
      ["/auth/signup", /Sign Up Free/i], ["/for-businesses", /Claim your listing/i],
    ] as const) {
      const link = Array.from(main.querySelectorAll<HTMLAnchorElement>(`a[href="${href}"]`))
        .find(candidate => label.test(candidate.textContent ?? ""));
      expect(link, `missing named ${href} homepage entry point`).toBeDefined();
      expect(link!.textContent).toMatch(label);
      expect(link!.closest("details:not([open]), [hidden]")).toBeNull();
    }
  });

  it("publishes the current booking and messaging limits without a closed disclosure", () => {
    const guidance = section("how-it-works");
    expectPublishedText(guidance, "Online bookings and payments are not available yet.");
    expectPublishedText(guidance, "Recording interest or messaging a business does not create a reservation.");
    expectPublishedText(guidance, "Messaging is available for businesses with verified ownership where supported.");
  });

  it("keeps the separate approval requirement beside the business claim action", () => {
    const business = section("for-businesses");
    expectPublishedText(business, "Claiming does not activate bookings or payments; launch requires separate approval.");
    expect(business.querySelector('a[href="/for-businesses"]')?.textContent).toContain("Claim your listing");
    expectPublishedText(section("join"), "You can browse the directory without signing up.");
  });
});
