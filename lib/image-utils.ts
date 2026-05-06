/**
 * Most external images now load directly from the browser — the CSP
 * img-src directive allows https: globally, and skipping the proxy
 * round-trip is a big LCP win (Lighthouse: routing everything through
 * the edge proxy doubled LCP on listing pages).
 *
 * We still proxy hosts that block hotlinking by referer (Facebook CDN,
 * Yelp CDN).
 *
 * Google Places photos are NOT proxied: ~94% of them are already stored
 * as Vercel Blob URLs (handled by the direct path below), and the
 * remaining ~6% are expired photo_references that bill Google ~$7/1000
 * just to return 400. Returning null for those rows surfaces the gradient
 * fallback in image-fallback.tsx until the weekly refresh cron pulls
 * fresh photos into Blob.
 */
const HOTLINK_BLOCKED_HOSTS = [
  "fbcdn.net",
  "fbsbx.com",
  "yelpcdn.com",
];

export function getImageUrl(
  url: string | null | undefined,
  _opts?: { width?: number },
): string | null {
  if (!url) return null;

  // Local paths, data URIs, blobs — leave alone
  if (
    url.startsWith("/") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  // Legacy googleapis.com photo URLs — drop them so the consumer falls
  // back to the gradient placeholder. Proxying these costs money.
  if (url.includes("googleapis.com/maps/api/place/photo")) {
    return null;
  }

  if (HOTLINK_BLOCKED_HOSTS.some((h) => url.includes(h))) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }

  // Everything else (including Vercel Blob URLs): load direct. CSP allows https:.
  return url;
}
