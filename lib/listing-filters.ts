/**
 * The one definition of "what can you filter listings by".
 *
 * Both the server-rendered /explore page and the /api/listings + /count
 * routes parse their query string through here, so the grid, the
 * "Showing X of Y" count and the HTML Google sees all agree. (Before this
 * the count endpoint still searched with a whole-phrase title ILIKE while
 * the list used stemmed terms — a search for "sunset cruise" showed 19
 * cards under "Showing 19 of 0".)
 *
 * Pure: no DB, importable from client components.
 */

export const LISTING_TYPES = [
  "stay",
  "tour",
  "dining",
  "event",
  "transport",
  "guide",
  "excursion",
  "transfer",
  "vip",
  "spa",
] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const SORT_OPTIONS = [
  "recommended",
  "rating",
  "price-asc",
  "price-desc",
  "newest",
  "most-reviews",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const DURATION_OPTIONS = ["under-2", "2-4", "4-8", "full-day", "multi-day"] as const;
export type DurationOption = (typeof DURATION_OPTIONS)[number];

export const EXPLORE_PAGE_SIZE = 24;

export type ListingFilters = {
  type: ListingType | null;
  island: string | null;
  q: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
  /** YYYY-MM-DD */
  date: string | null;
  guests: number | null;
  amenities: string[];
  duration: DurationOption | null;
  /** Matched through the same text index as `q` (the cuisine column is scraped noise). */
  cuisine: string | null;
  sort: SortOption;
  limit: number;
  offset: number;
};

export type ListingResult = {
  id: string;
  title: string;
  slug: string;
  type: string;
  headline: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  isFeatured: boolean | null;
  islandSlug: string;
  islandName: string;
  latitude: string | null;
  longitude: string | null;
  image: string | null;
  /** Where the rating/review count came from. Every imported listing is "google". */
  reviewSource: "google" | "vakaygo";
};

type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function readParam(src: ParamSource, key: string): string | null {
  let v: string | string[] | undefined | null;
  if (src instanceof URLSearchParams) v = src.get(key);
  else v = src[key];
  if (Array.isArray(v)) v = v[0];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function readNumber(src: ParamSource, key: string, opts: { min?: number; max?: number; int?: boolean } = {}): number | null {
  const raw = readParam(src, key);
  if (raw == null) return null;
  const n = opts.int ? parseInt(raw, 10) : parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (opts.min != null && n < opts.min) return null;
  if (opts.max != null && n > opts.max) return null;
  return n;
}

const SLUG_RE = /^[a-z0-9-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a query string (or Next's `searchParams` object) into validated
 * filters. Unknown/invalid values are dropped, never passed to SQL.
 *
 * `limit` defaults to the explore page size; callers may pass a bigger
 * `maxLimit` (the map fetches up to 2,000 pins).
 */
export function parseListingFilters(src: ParamSource, opts: { maxLimit?: number } = {}): ListingFilters {
  const rawType = readParam(src, "type") ?? readParam(src, "category");
  const type = rawType && rawType !== "all" && (LISTING_TYPES as readonly string[]).includes(rawType)
    ? (rawType as ListingType)
    : null;

  const rawIsland = readParam(src, "island");
  const island = rawIsland && SLUG_RE.test(rawIsland) ? rawIsland : null;

  const rawQ = readParam(src, "q");
  const q = rawQ ? rawQ.slice(0, 120) : null;

  const rawCuisine = readParam(src, "cuisine") ?? readParam(src, "cuisineType");
  const cuisine = rawCuisine ? rawCuisine.slice(0, 40) : null;

  const rawDate = readParam(src, "date");
  const date = rawDate && DATE_RE.test(rawDate) && !Number.isNaN(Date.parse(rawDate)) ? rawDate : null;

  const rawDuration = readParam(src, "duration");
  const duration = rawDuration && (DURATION_OPTIONS as readonly string[]).includes(rawDuration)
    ? (rawDuration as DurationOption)
    : null;

  const rawSort = readParam(src, "sort");
  const sort: SortOption = rawSort && (SORT_OPTIONS as readonly string[]).includes(rawSort)
    ? (rawSort as SortOption)
    : "recommended";

  const amenities = (readParam(src, "amenities") ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a && SLUG_RE.test(a))
    .slice(0, 12);

  const maxLimit = opts.maxLimit ?? 100;
  const requestedLimit = readNumber(src, "limit", { min: 1, int: true });
  const limit = Math.min(maxLimit, requestedLimit ?? EXPLORE_PAGE_SIZE);
  const offset = readNumber(src, "offset", { min: 0, max: 100_000, int: true }) ?? 0;

  return {
    type,
    island,
    q,
    minPrice: readNumber(src, "minPrice", { min: 0, max: 1_000_000 }),
    maxPrice: readNumber(src, "maxPrice", { min: 0, max: 1_000_000 }),
    minRating: readNumber(src, "minRating", { min: 0, max: 5 }),
    date,
    guests: readNumber(src, "guests", { min: 1, max: 100, int: true }),
    amenities,
    duration,
    cuisine,
    sort,
    limit,
    offset,
  };
}

/**
 * Canonical query string for a filter set — stable key order, defaults
 * omitted. Used as the cache key and as the URL the client writes back.
 */
export function filtersToSearchParams(
  f: Partial<ListingFilters>,
  opts: { includePaging?: boolean } = {},
): URLSearchParams {
  const p = new URLSearchParams();
  if (f.island) p.set("island", f.island);
  if (f.type) p.set("type", f.type);
  if (f.q) p.set("q", f.q);
  if (f.date) p.set("date", f.date);
  if (f.minPrice != null) p.set("minPrice", String(f.minPrice));
  if (f.maxPrice != null) p.set("maxPrice", String(f.maxPrice));
  if (f.minRating != null) p.set("minRating", String(f.minRating));
  if (f.guests != null) p.set("guests", String(f.guests));
  if (f.amenities && f.amenities.length) p.set("amenities", f.amenities.join(","));
  if (f.duration) p.set("duration", f.duration);
  if (f.cuisine) p.set("cuisine", f.cuisine);
  if (f.sort && f.sort !== "recommended") p.set("sort", f.sort);
  if (opts.includePaging) {
    if (f.limit != null) p.set("limit", String(f.limit));
    if (f.offset) p.set("offset", String(f.offset));
  }
  return p;
}

/**
 * Only island + type combinations are worth indexing as landing pages
 * ("Stays in Grenada"). Anything narrower (a search, a price band, a
 * date) is a personal view: noindex, canonical back to the island/type page.
 */
export function isIndexableFilterSet(f: ListingFilters): boolean {
  return (
    !f.q &&
    f.minPrice == null &&
    f.maxPrice == null &&
    f.minRating == null &&
    !f.date &&
    f.guests == null &&
    f.amenities.length === 0 &&
    !f.duration &&
    !f.cuisine &&
    f.sort === "recommended" &&
    f.offset === 0
  );
}

export const TYPE_LABELS: Record<ListingType, { singular: string; plural: string }> = {
  stay: { singular: "Stay", plural: "Stays" },
  tour: { singular: "Tour", plural: "Tours" },
  dining: { singular: "Restaurant", plural: "Dining" },
  event: { singular: "Event", plural: "Events" },
  transport: { singular: "Transport", plural: "Transport" },
  guide: { singular: "Local guide", plural: "Local Guides" },
  excursion: { singular: "Excursion", plural: "Excursions" },
  transfer: { singular: "Transfer", plural: "Transfers" },
  vip: { singular: "VIP experience", plural: "VIP Experiences" },
  spa: { singular: "Spa", plural: "Spa & Wellness" },
};
