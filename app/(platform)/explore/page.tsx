import type { Metadata } from "next";
import { logger } from "@/lib/logger";
import {
  parseListingFilters,
  filtersToSearchParams,
  isIndexableFilterSet,
  TYPE_LABELS,
  EXPLORE_PAGE_SIZE,
  type ListingFilters,
} from "@/lib/listing-filters";
import { getExploreData, exploreCacheKey, type ExploreData } from "@/server/listings-search";
import { ExploreClient } from "./explore-client";

/**
 * /explore — server-rendered.
 *
 * The first page of results is in the HTML (Google and first paint see
 * real cards, not a skeleton); the client component takes over for
 * filters, paging and the map. Reading `searchParams` makes the route
 * dynamic, so two caches do the work: `getExploreData` keeps each filter
 * set's rows for an hour, and proxy.ts tells Vercel's CDN to keep the
 * HTML for an hour too (nothing in the render depends on the viewer).
 */

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<SearchParams> };

const BASE_URL = "https://vakaygo.com";

function firstPageFilters(sp: SearchParams): ListingFilters {
  const f = parseListingFilters(sp);
  return { ...f, limit: EXPLORE_PAGE_SIZE, offset: 0 };
}

async function loadInitial(f: ListingFilters): Promise<ExploreData | null> {
  try {
    return await getExploreData(exploreCacheKey(f), f);
  } catch (error) {
    // Render the shell and let the client fetch; a DB blip should not 500
    // the main browse page.
    logger.error("Explore: initial listings failed", error);
    return null;
  }
}

function describe(f: ListingFilters, islandName: string | null) {
  const what = f.type ? TYPE_LABELS[f.type].plural : "Experiences";
  const where = islandName ?? (f.island ? f.island.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  const title = where ? `${what} in ${where}` : f.type ? `${what} in the Caribbean` : "Explore Caribbean experiences";
  const nouns: Record<string, string> = {
    stay: "hotels, villas, guesthouses and apartments",
    tour: "guided tours and day trips",
    dining: "restaurants, cafés and beach bars",
    event: "festivals, concerts and nightlife",
    transport: "car hire, taxis and ferries",
    guide: "local guides",
    excursion: "boat trips, snorkelling, hikes and island excursions",
    transfer: "airport and hotel transfers",
    vip: "private charters, yachts and VIP experiences",
    spa: "spas, massage and wellness",
  };
  const description = f.type
    ? `Compare ${nouns[f.type]} ${where ? `in ${where}` : "across 21 Caribbean islands"} on VakayGo — local operators, honest listings, the lowest commissions in travel.`
    : `Search 7,000+ stays, tours, dining, events and local guides ${where ? `in ${where}` : "across 21 Caribbean islands"}. Filter by island, category, price and more on VakayGo.`;
  return { title, description };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = firstPageFilters(await searchParams);
  const indexable = isIndexableFilterSet(f);
  // Only island/type combos are landing pages; a search or a price band
  // canonicalises back to its island/type page and stays out of the index.
  const canonicalParams = filtersToSearchParams({ island: f.island, type: f.type });
  const canonical = `${BASE_URL}/explore${canonicalParams.size ? `?${canonicalParams}` : ""}`;

  let islandName: string | null = null;
  if (f.island && indexable) {
    const data = await loadInitial(f);
    islandName = data?.island?.name ?? null;
  }
  const { title, description } = describe(f, islandName);

  return {
    title, // the root layout template appends " | VakayGo"
    description,
    alternates: { canonical },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: canonical, type: "website" },
  };
}

export default async function ExplorePage({ searchParams }: Props) {
  const filters = firstPageFilters(await searchParams);
  const data = await loadInitial(filters);
  const { title } = describe(filters, data?.island?.name ?? null);

  return (
    <ExploreClient
      initial={{
        filters,
        listings: data?.listings ?? [],
        totalCount: data?.totalCount ?? 0,
        islandName: data?.island?.name ?? null,
        heading: title,
        loaded: data !== null,
      }}
    />
  );
}
