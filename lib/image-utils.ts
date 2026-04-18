/**
 * Routes external image URLs through our image proxy. Two reasons:
 *   1. The site CSP only whitelists a handful of image hosts. Anything
 *      else (operator websites, Cloudinary, Yelp, etc.) is blocked at
 *      the browser. Proxying makes every image come from "self".
 *   2. Lets us strip stale Google Places API keys and append the
 *      current one server-side.
 *
 * Local/relative URLs and data: URIs pass through unchanged.
 */
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

  // Only proxy http(s)
  if (!/^https?:\/\//i.test(url)) return url;

  // Google Places — strip stale API key, proxy will append a fresh one
  if (url.includes("googleapis.com/maps/api/place/photo")) {
    const cleaned = url.replace(/[&?]key=[^&]*/g, "").replace(/\?&/, "?");
    return `/api/images/proxy?url=${encodeURIComponent(cleaned)}`;
  }

  return `/api/images/proxy?url=${encodeURIComponent(url)}`;
}
