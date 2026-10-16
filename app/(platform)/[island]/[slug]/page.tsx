import { listingStructuredData, serializeJsonLd } from "@/lib/listing-structured-data";
import { notFound } from "next/navigation";
import { getListingDetail } from "@/server/listing-detail";
import {
  ListingDetailClient,
  type ListingDetail,
  type SimilarListing,
} from "./listing-detail-client";

// ISR: rendered on first request, served from the CDN for 24 hours, then
// refreshed in the background (and flushed immediately on-demand via
// revalidateListing() whenever an operator or admin updates the listing).
export const revalidate = 86400;
// No build-time enumeration (7k listings / DB fan-out): every path renders
// on first request and is then served from the cache until revalidated.
export async function generateStaticParams() {
  return [];
}

/**
 * Server component wrapper — fetches the listing from the DB and hands it
 * to the interactive client component as initial data. This puts the full
 * listing body (description, prices, photo gallery <img> tags) in the
 * server-rendered HTML; the previous client-only version served crawlers
 * a loading spinner.
 */
export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ island: string; slug: string }>;
}) {
  const { slug, island } = await params;
  const result = await getListingDetail(slug, island);

  if (!result) notFound();

  return (
    <>
    <script id="listing-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(listingStructuredData(result.listing)) }} />
    <ListingDetailClient
      key={result.listing.id}
      initialListing={result.listing as unknown as ListingDetail}
      initialSimilar={result.similar as unknown as SimilarListing[]}
    />
    </>
  );
}
