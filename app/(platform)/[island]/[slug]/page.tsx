import { notFound } from "next/navigation";
import { getListingDetail } from "@/server/listing-detail";
import {
  ListingDetailClient,
  type ListingDetail,
  type SimilarListing,
} from "./listing-detail-client";

// ISR: rendered on first request, served from the CDN for an hour, then
// refreshed in the background. Nothing on this page is per-user (auth UI is
// client-fetched), so caching is safe.
export const revalidate = 3600;
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
  const { slug } = await params;
  const result = await getListingDetail(slug);

  if (!result) notFound();

  return (
    <ListingDetailClient
      initialListing={result.listing as unknown as ListingDetail}
      initialSimilar={result.similar as unknown as SimilarListing[]}
    />
  );
}
