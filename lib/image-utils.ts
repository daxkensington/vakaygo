/**
 * Most external images now load directly from the browser — the CSP
 * img-src directive allows https: globally, and skipping the proxy
 * round-trip is a big LCP win (Lighthouse: routing everything through
 * the edge proxy doubled LCP on listing pages).
 *
 * We still proxy the cases that *need* it:
 *   - Google Places photos: the URL needs the server-side API key
 *     appended.
 *   - Hosts that block hotlinking by referer (Facebook CDN, Yelp CDN).
 */
const HOTLINK_BLOCKED_HOSTS = [
  "fbcdn.net",
  "fbsbx.com",
  "yelpcdn.com",
];

export function getImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Local paths, data URIs, blobs — leave alone
  if (
    url.startsWith("/") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  // Google Places — strip stale API key, proxy will append a fresh one
  if (url.includes("googleapis.com/maps/api/place/photo")) {
    const cleaned = url.replace(/[&?]key=[^&]*/g, "").replace(/\?&/, "?");
    return `/api/images/proxy?url=${encodeURIComponent(cleaned)}`;
  }

  if (HOTLINK_BLOCKED_HOSTS.some((h) => url.includes(h))) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }

  // Everything else: load direct. CSP allows https:.
  return url;
}
