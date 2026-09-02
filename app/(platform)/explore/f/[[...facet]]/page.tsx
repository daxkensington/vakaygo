import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LISTING_TYPES, parseListingFilters, EXPLORE_PAGE_SIZE, type ListingFilters } from "@/lib/listing-filters";
import { loadInitial, buildMetadata, ExploreServer } from "../../explore-server";

/**
 * /explore/f/[[...facet]] — the ISR entry point for the indexable explore
 * landings. Visitors never see this path: next.config rewrites
 *   /explore                        → /explore/f
 *   /explore?island=grenada         → /explore/f/grenada
 *   /explore?island=grenada&type=stay → /explore/f/grenada/stay
 *   /explore?type=stay              → /explore/f/all/stay
 * (only when no other query key is present) and redirects any direct hit
 * on /explore/f/... back to the query form. Nothing here reads
 * searchParams, so the route is static + revalidated hourly and the CDN
 * serves it as a HIT.
 */

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ facet?: string[] }> };

function filtersFromFacet(facet: string[] | undefined): ListingFilters | null {
  const [island, type, ...rest] = facet ?? [];
  if (rest.length) return null;
  if (type && !(LISTING_TYPES as readonly string[]).includes(type)) return null;
  const f = parseListingFilters({
    island: island && island !== "all" ? island : undefined,
    type,
  });
  // A bad island slug parses to null; the rewrite regex only admits
  // [a-z0-9-], so this only trips on hand-typed junk. 404 either way.
  if (island && island !== "all" && !f.island) return null;
  return { ...f, limit: EXPLORE_PAGE_SIZE, offset: 0 };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = filtersFromFacet((await params).facet);
  if (!f) return { robots: { index: false, follow: false } };
  return buildMetadata(f);
}

export default async function ExploreFacetPage({ params }: Props) {
  const filters = filtersFromFacet((await params).facet);
  if (!filters) notFound();
  const data = await loadInitial(filters);
  // Unknown island: don't let the CDN keep an empty "Stays in Xyz" page.
  if (filters.island && data && !data.island) notFound();
  return <ExploreServer filters={filters} data={data} />;
}
