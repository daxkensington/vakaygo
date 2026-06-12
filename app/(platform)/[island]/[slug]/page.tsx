import { notFound } from "next/navigation";
import { getListingDetail } from "@/server/listing-detail";
import {
  ListingDetailClient,
  type ListingDetail,
  type SimilarListing,
} from "./listing-detail-client";

export const dynamic = "force-dynamic";

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
