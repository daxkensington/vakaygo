/**
 * Transforms Google Places photo URLs to use the image proxy,
 * which appends the API key server-side. Non-Google URLs pass through unchanged.
 */
export function getImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes("googleapis.com/maps/api/place/photo")) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
