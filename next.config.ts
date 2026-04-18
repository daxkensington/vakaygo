import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
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
const nextConfig: NextConfig = {
  images: {
    qualities: [75, 80],
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
    return [
      { source: "/things-to-do-in-:island", destination: "/things-to-do-in/:island" },
      { source: "/best-restaurants-:island", destination: "/best-restaurants/:island" },
      { source: "/best-hotels-:island", destination: "/best-hotels/:island" },
    ];
  },
  // Redirects fire before rewrites — anyone hitting the internal path
  // gets bounced to the canonical dashed URL so search engines never see
  // two URLs for the same page.
  async redirects() {
    return [
      { source: "/things-to-do-in/:island", destination: "/things-to-do-in-:island", permanent: true },
      { source: "/best-restaurants/:island", destination: "/best-restaurants-:island", permanent: true },
      { source: "/best-hotels/:island", destination: "/best-hotels-:island", permanent: true },
    ];
  },
};

export default withSentryConfig(
  withNextIntl(withBundleAnalyzer(nextConfig)),
  {
    org: "vakaygo",
    project: "vakaygo-web",
    silent: true,
    widenClientFileUpload: true,
    disableLogger: true,
  }
);
