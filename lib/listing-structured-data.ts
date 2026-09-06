const BASE = "https://vakaygo.com";
export function safeWebUrl(value: unknown, allowRelative = false): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try { const url = new URL(value, allowRelative ? BASE : undefined); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function serializeJsonLd(value: unknown): string { return JSON.stringify(value).replace(/</g, "\\u003c"); }
export type StructuredListing = {
  title: string; slug: string; type: string; description: string | null;
  address: string | null; parish: string | null; islandSlug: string; islandName: string; islandCountry: string;
  latitude: string | null; longitude: string | null; typeData: Record<string, unknown> | null;
  images: { url: string; type?: string | null }[];
};
export function listingStructuredData(listing: StructuredListing) {
  const td = listing.typeData || {};
  const url = BASE + "/" + listing.islandSlug + "/" + listing.slug;
  // These are business/directory records. An event without a verified schedule
  // is not an Event rich result; imported ratings and unverified offers are omitted.
  const types: Record<string, string> = { stay: "LodgingBusiness", dining: "Restaurant", spa: "HealthAndBeautyBusiness" };
  const entity: Record<string, unknown> = {
    "@type": types[listing.type] || "LocalBusiness", "@id": url + "#business",
    name: listing.title, url, description: listing.description || undefined,
    address: { "@type": "PostalAddress", streetAddress: listing.address || undefined,
      addressLocality: listing.parish || listing.islandName, addressCountry: listing.islandCountry },
    image: listing.images.filter(img => img.type !== "video").map(img => safeWebUrl(img.url, true)).filter(Boolean),
    telephone: typeof td.phone === "string" ? td.phone : undefined,
    sameAs: safeWebUrl(td.website),
  };
  const lat = listing.latitude === null ? NaN : Number(listing.latitude);
  const lng = listing.longitude === null ? NaN : Number(listing.longitude);
  if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180) {
    entity.geo = { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
  }
  if (listing.type === "dining" && typeof td.cuisineType === "string") entity.servesCuisine = td.cuisineType;
  return { "@context": "https://schema.org", "@graph": [entity, {
    "@type": "WebPage", "@id": url + "#webpage", url, name: listing.title + " in " + listing.islandName,
    mainEntity: { "@id": url + "#business" }, isPartOf: { "@id": BASE + "/#website" },
  }] };
}
