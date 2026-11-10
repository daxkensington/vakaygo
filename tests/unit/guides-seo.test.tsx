import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import { GuidesIndex } from "@/components/blog/guides-index";
import { buildGuideArticleJsonLd, EDITORIAL_BYLINE, guideAuthor, guideBylineName } from "@/lib/guide-byline";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

const guides = [
  { slug: "santorini-travel-guide", title: "Santorini Travel Guide", category: "destination-guide", islandName: "Santorini" },
  { slug: "top-10-caribbean-beaches", title: "Top 10 Caribbean Beaches", category: "travel-tips", islandName: null },
  { slug: "island-hopping-on-a-budget", title: "Island Hopping on a Budget", category: "planning", islandName: null },
  { slug: "odd-one", title: "Odd One", category: "uncategorised", islandName: null },
];

describe("server-rendered guides index", () => {
  it("renders a plain crawlable link to every guide", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<GuidesIndex guides={guides} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.sort()).toEqual(guides.map((guide) => `/guides/${guide.slug}`).sort());
    expect(container.querySelector("h2")?.textContent).toBe("All travel guides");
    expect(Array.from(container.querySelectorAll("h3")).map((h) => h.textContent)).toEqual([
      "Destination Guides", "Travel Tips", "Trip Planning", "uncategorised",
    ]);
  });

  it("renders nothing when there are no guides", () => {
    expect(renderToStaticMarkup(<GuidesIndex guides={[]} />)).toBe("");
  });
});

describe("guide byline", () => {
  it("replaces placeholder accounts with the editorial identity", () => {
    for (const name of ["VakayGo Demo", "demo", "Test Account", "Site Admin", "VakayGo", "", null, undefined]) {
      expect(guideAuthor(name)).toEqual({ name: EDITORIAL_BYLINE, type: "Organization" });
    }
    expect(guideBylineName("VakayGo Demo")).toBe("VakayGo Editorial");
  });

  it("keeps a real author as a person", () => {
    expect(guideAuthor("Maya Charles")).toEqual({ name: "Maya Charles", type: "Person" });
    expect(guideAuthor("Demotria Lewis")).toEqual({ name: "Demotria Lewis", type: "Person" });
  });
});

describe("guide Article JSON-LD", () => {
  const base = {
    slug: "santorini-travel-guide",
    title: "Santorini Travel Guide",
    excerpt: "Where to stay and what to do.",
    coverImage: "/images/islands/santorini.jpg",
    authorName: "VakayGo Demo",
    publishedAt: new Date("2026-04-03T03:04:40.894Z"),
    createdAt: new Date("2026-04-03T03:04:40.770Z"),
    updatedAt: new Date("2026-10-16T06:00:00.000Z"),
  };

  it("uses the editorial author, a logo that exists, an absolute image and the real modified date", () => {
    const jsonLd = buildGuideArticleJsonLd(base);
    expect(jsonLd.author).toEqual({ "@type": "Organization", name: "VakayGo Editorial", url: "https://vakaygo.com" });
    expect(jsonLd.publisher.logo.url).toBe("https://vakaygo.com/images/logo.jpg");
    expect(jsonLd.image).toBe("https://vakaygo.com/images/islands/santorini.jpg");
    expect(jsonLd.datePublished).toBe("2026-04-03T03:04:40.894Z");
    expect(jsonLd.dateModified).toBe("2026-10-16T06:00:00.000Z");
    expect(jsonLd.mainEntityOfPage).toBe("https://vakaygo.com/guides/santorini-travel-guide");
    expect(JSON.stringify(jsonLd)).not.toContain("Demo");
  });

  it("never reports a modified date earlier than the publish date", () => {
    const jsonLd = buildGuideArticleJsonLd({ ...base, updatedAt: new Date("2026-04-03T03:04:40.770Z") });
    expect(jsonLd.dateModified).toBe(jsonLd.datePublished);
  });

  it("keeps an absolute cover image and omits a missing one", () => {
    expect(buildGuideArticleJsonLd({ ...base, coverImage: "https://cdn.example/x.jpg" }).image).toBe("https://cdn.example/x.jpg");
    expect("image" in buildGuideArticleJsonLd({ ...base, coverImage: null })).toBe(false);
  });
});
