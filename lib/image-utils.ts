/**
 * Routes external image URLs through our image proxy to avoid
 * CORS/hotlinking issues and to append API keys server-side.
 *
 * Google Places URLs get their stale key= stripped so the proxy
 * always uses the current server-side key.
 * Unsplash and Grok (imgen.x.ai) URLs are proxied to avoid hotlink blocks.
 * Local/relative URLs pass through unchanged.
 */
export function getImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Google Places — strip stale API key
  if (url.includes("googleapis.com/maps/api/place/photo")) {
    const cleaned = url.replace(/[&?]key=[^&]*/g, "").replace(/\?&/, "?");
    return `/api/images/proxy?url=${encodeURIComponent(cleaned)}`;
  }

  // Unsplash and Grok images — proxy to avoid hotlink blocks
  if (url.includes("images.unsplash.com") || url.includes("imgen.x.ai")) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }

  // Facebook CDN and Yelp CDN — proxy to avoid hotlink/CORS issues
  if (
    url.includes("fbcdn.net") ||
    url.includes("fbsbx.com") ||
    url.includes("yelpcdn.com")
  ) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}
