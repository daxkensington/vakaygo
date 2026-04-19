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

export function getImageUrl(
  url: string | null | undefined,
  opts?: { width?: number },
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

  // Google Places — strip stale API key, optionally cap maxwidth for
  // thumbnail contexts so a 600 KB hero JPG isn't shipped for a 200 px
  // card. The proxy appends a fresh API key server-side.
  if (url.includes("googleapis.com/maps/api/place/photo")) {
    let cleaned = url.replace(/[&?]key=[^&]*/g, "").replace(/\?&/, "?");
    if (opts?.width) {
      cleaned = cleaned.replace(/([?&])maxwidth=\d+/, `$1maxwidth=${opts.width}`);
      if (!/[?&]maxwidth=/.test(cleaned)) {
        cleaned += (cleaned.includes("?") ? "&" : "?") + `maxwidth=${opts.width}`;
      }
    }
    return `/api/images/proxy?url=${encodeURIComponent(cleaned)}`;
  }

  if (HOTLINK_BLOCKED_HOSTS.some((h) => url.includes(h))) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }

  // Everything else: load direct. CSP allows https:.
  return url;
}
