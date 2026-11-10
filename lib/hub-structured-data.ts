/**
 * ItemList entries for the best-hotels / best-restaurants hubs.
 *
 * The ratings and review counts on these listings are imported from Google
 * Places, and most prices are type-default placeholders. Neither may be
 * marked up: review-snippet markup is for a site's own reviews, and a
 * priceRange derived from a placeholder states a price the business never
 * published. Keep this to name, URL and address until first-party reviews
 * and operator-set prices exist (see lib/listing-structured-data.ts, which
 * applies the same rule on listing pages).
 */
export type HubListing = {
  title: string;
  slug: string;
  islandSlug: string;
  parish: string | null;
};

export type HubItemType = "LodgingBusiness" | "Restaurant";

export function buildHubListItem(
  itemType: HubItemType,
  listing: HubListing,
  destination: { name: string; country: string | null },
) {
  return {
    "@type": itemType,
    name: listing.title,
    url: `https://vakaygo.com/${listing.islandSlug}/${listing.slug}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.parish || destination.name,
      ...(destination.country ? { addressCountry: destination.country } : {}),
    },
  };
}
