import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { resolveListingRedirect } from "@/server/listing-redirects";
import { getListingForSeo } from "@/server/seo-queries";
import {
  buildListingDescription,
  buildListingTitle,
  cleanLocationLabel,
  listingTitleHook,
  type ListingSeoOptions,
} from "@/lib/listing-seo";

type Props = {
  children: React.ReactNode;
  params: Promise<{ island: string; slug: string }>;
};

const typeLabels: Record<string, string> = {
  stay: "Stay",
  excursion: "Excursion",
  tour: "Tour",
  dining: "Restaurant",
  event: "Event",
  transport: "Transport",
  guide: "Guide",
  transfer: "Transfer",
  vip: "VIP Experience",
  spa: "Spa & Wellness",
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { island, slug } = await params;
  const listing = await getListingForSeo(island, slug);
  if (!listing) return { title: "Not Found" };

  const typeLabel = typeLabels[listing.type] || "Listing";
  const locationLabel = cleanLocationLabel(listing.parish, listing.islandName);
  const td = listing.typeData || {};
  const seoOptions: ListingSeoOptions = {
    hasMenu: listing.hasMenu === true,
    name: listing.title,
    category: typeof td.category === "string" ? td.category : null,
    cuisineType:
      listing.cuisineType || (typeof td.cuisineType === "string" ? td.cuisineType : null),
    googleTypes: td.googleTypes,
  };
  const hook = listingTitleHook(listing.type, seoOptions);
  const isAutoMetaTitle = listing.metaTitle
    ? /\s[-—]\s[^|]+\sin\s[^|]+\|\s*VakayGo$/i.test(listing.metaTitle.trim())
    : false;
  // title.absolute bypasses the parent template chain so the title is
  // identical regardless of nesting depth.
  const title =
    (listing.metaTitle && !isAutoMetaTitle ? listing.metaTitle : null) ||
    buildListingTitle(listing.title, locationLabel, hook);
  const description = buildListingDescription({
    name: listing.title,
    type: listing.type,
    typeLabel,
    location: locationLabel,
    hook,
    metaDescription: listing.metaDescription,
    description: listing.description,
    headline: listing.headline,
    options: seoOptions,
  });
  const url = `https://vakaygo.com/${island}/${slug}`;
  const ogCardUrl = `https://vakaygo.com/api/og?title=${encodeURIComponent(listing.title)}&subtitle=${encodeURIComponent(`${typeLabel} in ${locationLabel}`)}`;
  const ogImages =
    listing.primaryImage && listing.primaryImage.startsWith("https://")
      ? [
          { url: listing.primaryImage, alt: listing.title },
          { url: ogCardUrl, width: 1200, height: 630, alt: listing.title },
        ]
      : [{ url: ogCardUrl, width: 1200, height: 630, alt: listing.title }];

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "VakayGo",
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImages.map((img) => img.url),
    },
  };
}

// Server-side gate: invalid (or inactive) listing slugs 404 instead of
// rendering the client component's "Listing not found" UI with a 200.
export default async function ListingLayout({ children, params }: Props) {
  const { island, slug } = await params;
  const listing = await getListingForSeo(island, slug);
  if (!listing) {
    await redirectOrNotFound(island, slug);
  }
  return children;
}

/**
 * A URL with no public listing: a merged duplicate or moved listing redirects
 * permanently to where it lives now, a paused listing temporarily to its
 * destination, anything else is a 404. Called from the layout AND the page,
 * because a layout redirect does not stop the page from rendering.
 */
async function redirectOrNotFound(island: string, slug: string): Promise<never> {
  const target = await resolveListingRedirect(island, slug);
  if (target?.permanent) permanentRedirect(target.location);
  if (target) redirect(target.location);
  notFound();
}
