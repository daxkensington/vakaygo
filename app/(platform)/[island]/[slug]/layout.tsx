import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getListingForSeo } from "@/server/seo-queries";

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

const typeHooks: Record<string, string> = {
  dining: "Menu, Hours, Photos & Reviews",
  stay: "Photos, Amenities, Location & Reviews",
  excursion: "Activity Details, Photos & Reviews",
  tour: "Tour Details, Photos & Reviews",
  spa: "Services, Hours, Location & Reviews",
  transport: "Transport Details, Location & Reviews",
  transfer: "Transfer Details, Location & Reviews",
};

function cleanLocationLabel(parish: string | null, islandName: string): string {
  const island = islandName.trim();
  if (!parish) return island;
  const escaped = island.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = parish
    .replace(new RegExp(`\\b${escaped}\\b`, "ig"), "")
    .replace(/[,\s]+$/, "")
    .trim();
  if (!stripped || stripped.toLowerCase() === island.toLowerCase()) return island;
  return `${stripped}, ${island}`;
}

function clipMetaDescription(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= 158) return normalized;
  return `${normalized.slice(0, 155).replace(/\s+\S*$/, "").replace(/[,;:.\s]+$/, "")}…`;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { island, slug } = await params;
  const listing = await getListingForSeo(island, slug);
  if (!listing) return { title: "Not Found" };

  const typeLabel = typeLabels[listing.type] || "Listing";
  const locationLabel = cleanLocationLabel(listing.parish, listing.islandName);
  const hook = typeHooks[listing.type] || `${typeLabel} Hours, Photos & Reviews`;
  const isAutoMetaTitle = listing.metaTitle
    ? /\s[-—]\s[^|]+\sin\s[^|]+\|\s*VakayGo$/i.test(listing.metaTitle.trim())
    : false;
  // title.absolute bypasses the parent template chain so the title is
  // identical regardless of nesting depth.
  const title =
    (listing.metaTitle && !isAutoMetaTitle ? listing.metaTitle : null) ||
    `${listing.title} (${locationLabel}) — ${hook} | VakayGo`;
  const rawDescription =
    listing.metaDescription ||
    listing.description ||
    listing.headline ||
    `${listing.title} — ${hook.toLowerCase()} for this ${typeLabel.toLowerCase()} in ${locationLabel} on VakayGo.`;
  const description = clipMetaDescription(rawDescription);
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
  if (!listing) notFound();
  return children;
}
