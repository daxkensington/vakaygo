import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Security headers live in proxy.ts. Don't set them here too — duplicate
// CSPs combine via stricter-of-both.
//
// SRI was enabled here via `experimental.sri` but it broke hydration on
// Vercel: the edge compression pipeline modifies bundle bytes after Next
// computes the integrity hashes, so every script fails SRI verification
// silently and React never boots. Disabled until the Next+Vercel combo
// produces matching hashes. See proxy.ts for CSP.
// Keep in step with lib/listing-filters.ts (next.config cannot import
// from the app without breaking the TS/ESM boundary at config load).
const EXPLORE_TYPES = ["stay", "tour", "dining", "event", "transport", "guide", "excursion", "transfer", "vip", "spa"];
const EXPLORE_QUERY_KEYS = [
  "island", "type", "category", "q", "minPrice", "maxPrice", "minRating", "date", "guests",
  "amenities", "duration", "cuisine", "cuisineType", "sort", "limit", "offset",
];

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 80],
    // Listing photos are immutable Blob objects (new photo = new URL), so
    // cache each optimised variant for 31 days. Fewer breakpoints = fewer
    // transformations billed per source image.
    minimumCacheTTL: 2678400,
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [96, 200, 400],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "imgen.x.ai" },
      { protocol: "https", hostname: "*.vercel-storage.com" },
    ],
  },
  // SEO-friendly URLs map to proper dynamic routes. Next.js doesn't treat
  // a folder like `things-to-do-in-[island]` as dynamic (the bracket has
  // to start the segment), so we keep the canonical URL on the front and
  // rewrite to a sibling folder that *is* a real dynamic route.
  async rewrites() {
    // /explore landings. `/explore` is a dynamic route (it reads
    // searchParams, so Next stamps it no-store and the CDN never caches
    // it). The URLs worth indexing — bare, island, island+type, type —
    // are rewritten BEFORE the file-system route matches to an ISR
    // sibling that never reads the query. Any other key (a search, a
    // price band, a sort, paging) keeps the request on the dynamic page.
    const exploreOnlyKeys = EXPLORE_QUERY_KEYS.filter((k) => k !== "island" && k !== "type").map((key) => ({
      type: "query" as const,
      key,
    }));
    const island = { type: "query" as const, key: "island", value: "(?<island>[a-z0-9-]{1,64})" };
    const type = { type: "query" as const, key: "type", value: `(?<type>${EXPLORE_TYPES.join("|")})` };
    const noIsland = { type: "query" as const, key: "island" };
    const noType = { type: "query" as const, key: "type" };
    return {
      beforeFiles: [
        { source: "/explore", has: [island, type], missing: exploreOnlyKeys, destination: "/explore/f/:island/:type" },
        { source: "/explore", has: [island], missing: [noType, ...exploreOnlyKeys], destination: "/explore/f/:island" },
        { source: "/explore", has: [type], missing: [noIsland, ...exploreOnlyKeys], destination: "/explore/f/all/:type" },
        { source: "/explore", missing: [noIsland, noType, ...exploreOnlyKeys], destination: "/explore/f" },
      ],
      afterFiles: [
        { source: "/things-to-do-in-:island", destination: "/things-to-do-in/:island" },
        { source: "/best-restaurants-:island", destination: "/best-restaurants/:island" },
        { source: "/best-hotels-:island", destination: "/best-hotels/:island" },
      ],
    };
  },
  // Redirects fire before rewrites — anyone hitting the internal path
  // gets bounced to the canonical dashed URL so search engines never see
  // two URLs for the same page.
  async redirects() {
    return [
      // The ISR explore routes are an implementation detail — anyone who
      // lands on the path form gets the public query-string URL.
      { source: "/explore/f", destination: "/explore", permanent: true },
      { source: "/explore/f/all/:type", destination: "/explore?type=:type", permanent: true },
      { source: "/explore/f/:island/:type", destination: "/explore?island=:island&type=:type", permanent: true },
      { source: "/explore/f/:island", destination: "/explore?island=:island", permanent: true },
      { source: "/things-to-do-in/:island", destination: "/things-to-do-in-:island", permanent: true },
      { source: "/best-restaurants/:island", destination: "/best-restaurants-:island", permanent: true },
      { source: "/best-hotels/:island", destination: "/best-hotels-:island", permanent: true },
    ];
  },
};

export default withSentryConfig(
  withBundleAnalyzer(nextConfig),
  {
    org: "vakaygo",
    project: "vakaygo-web",
    silent: true,
    widenClientFileUpload: true,
    disableLogger: true,
  }
);
