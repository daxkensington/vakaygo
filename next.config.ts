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
// Why not nonce-based CSP: Next.js 16 docs note that nonces force all pages
// into dynamic rendering (kills CDN caching + PPR). For a content-heavy site
// like vakaygo (7k+ listings, SEO-sensitive), that tradeoff is too steep.
// We use experimental SRI instead — adds integrity hashes to script tags at
// build time, protecting against script tampering while preserving static
// generation. See the CSP comment in proxy.ts.
const nextConfig: NextConfig = {
  experimental: {
    sri: { algorithm: "sha256" },
  },
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
