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
 * Shared by the two /explore entry points:
 *
 *  - `/explore/f/[[...facet]]` — ISR (revalidate 1h). next.config rewrites
 *    the indexable URLs (`/explore`, `/explore?island=x`,
 *    `/explore?island=x&type=y`, `/explore?type=y`) here BEFORE the file
 *    system route matches, so those never read `searchParams` and the CDN
 *    caches them like any other public page.
 *  - `/explore` (page.tsx) — dynamic. Anything with a search, price band,
 *    date, sort, or paging lands here; it reads `searchParams` and is
 *    served per request (data cached an hour per filter set).
 *
 * Both render the first 24 cards into the HTML and hand off to
 * ExploreClient for filters, paging and the map.
 */

const BASE_URL = "https://vakaygo.com";

type SearchParams = Record<string, string | string[] | undefined>;

export function firstPageFilters(sp: SearchParams): ListingFilters {
  const f = parseListingFilters(sp);
  return { ...f, limit: EXPLORE_PAGE_SIZE, offset: 0 };
}

export async function loadInitial(f: ListingFilters): Promise<ExploreData | null> {
  try {
    return await getExploreData(exploreCacheKey(f), f);
  } catch (error) {
    // Render the shell and let the client fetch; a DB blip should not 500
    // the main browse page.
    logger.error("Explore: initial listings failed", error);
    return null;
  }
}

export function describe(f: ListingFilters, islandName: string | null) {
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

/** The public URL for a filter set's landing page (query form, never /explore/f). */
export function canonicalUrl(f: Pick<ListingFilters, "island" | "type">): string {
  const p = filtersToSearchParams({ island: f.island, type: f.type });
  return `${BASE_URL}/explore${p.size ? `?${p}` : ""}`;
}

export async function buildMetadata(f: ListingFilters, data?: ExploreData | null): Promise<Metadata> {
  const indexable = isIndexableFilterSet(f);
  const canonical = canonicalUrl(f);

  let islandName: string | null = data?.island?.name ?? null;
  if (islandName == null && f.island && indexable && data === undefined) {
    islandName = (await loadInitial(f))?.island?.name ?? null;
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

export async function ExploreServer({ filters, data }: { filters: ListingFilters; data: ExploreData | null }) {
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
