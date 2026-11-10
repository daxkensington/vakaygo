import { listingStructuredData, serializeJsonLd } from "@/lib/listing-structured-data";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { resolveListingRedirect } from "@/server/listing-redirects";
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

  if (!result) await redirectOrNotFound(island, slug);
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
