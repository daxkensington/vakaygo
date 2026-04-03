/**
 * Transforms Google Places photo URLs to use the image proxy,
 * which appends the API key server-side. Non-Google URLs pass through unchanged.
 *
 * Strips any existing `key=` param from the stored URL so the proxy always
 * uses the current server-side key (handles key rotation gracefully).
 */
export function getImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes("googleapis.com/maps/api/place/photo")) {
    // Strip any existing API key so the proxy appends the current one
    const cleaned = url.replace(/[&?]key=[^&]*/g, "").replace(/\?&/, "?");
    return `/api/images/proxy?url=${encodeURIComponent(cleaned)}`;
  }
  return url;
}
