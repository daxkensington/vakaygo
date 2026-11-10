import { bookingLaunchEnabled } from "@/server/business-onboarding";
import { createDb } from "@/server/db";
import { listings, islands, media, listingOnboarding } from "@/drizzle/schema";
import { eq, and, desc, asc, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";
import { parseSearchQuery, likeEscape } from "@/lib/search-terms";
import { stayFitsGuests } from "@/server/listing-capacity";
import { getExchangeRates } from "@/server/exchange-rates";
import { listingPriceInUsd } from "@/server/listing-prices";
import { publicDirectoryListings } from "@/server/public-listing-eligibility";
import { importedListingInteger, importedMultiDay } from "@/server/listing-import-values";
import { currentListingBookable, currentListingClaimVerified } from "@/server/listing-bookability-sql";
import { isQuarantinedLocation } from "@/server/location-quarantine";
import {
  filtersToSearchParams,
  NO_EXPLORE_CAPABILITIES,
  type ExploreCapabilities,
  type ListingFilters,
  type ListingResult,
} from "@/lib/listing-filters";

/**
 * Listing search shared by the /explore page (server-rendered) and the
 * /api/listings + /api/listings/count routes. One place decides what a
 * filter means, so the cards, the count and the HTML always agree.
 */

type Db = ReturnType<typeof createDb>;

function buildWhere(f: ListingFilters, bookingsEnabled: boolean, usdPrice: SQL): { where: SQL; relevance: SQL | null } {
  const conditions: SQL[] = [publicDirectoryListings()];

  if (f.type) conditions.push(eq(listings.type, f.type));

  // Subquery instead of a round trip; an unknown island slug yields no
  // rows rather than silently showing every island.
  if (f.island) {
    conditions.push(
      sql`${listings.islandId} = (select ${islands.id} from ${islands} where ${islands.slug} = ${f.island} limit 1)`,
    );
  }

  if (f.date) {
    conditions.push(bookingsEnabled ? sql`CASE WHEN ${currentListingBookable()} THEN vakaygo_booking_dates_available(${listings.id}, ${f.date}::timestamp, CASE WHEN ${listings.type}='stay' THEN ${f.date}::timestamp + interval '1 day' ELSE NULL END, ${f.guests || 1}, NULL) ELSE false END` : sql`false`);
  }

  // Free text + cuisine share one haystack: title, headline, description,
  // cuisine, typeData (Google types, "serves", tags). See lib/search-terms.ts.
  const haystack = sql`(coalesce(${listings.title}, '') || ' ' || coalesce(${listings.headline}, '') || ' ' || coalesce(${listings.description}, '') || ' ' || coalesce(${listings.cuisineType}, '') || ' ' || coalesce(${listings.typeData}::text, ''))`;

  let relevance: SQL | null = null;
  if (f.q) {
    const parsed = parseSearchQuery(f.q);
    const termClauses = parsed.terms.map((t) => sql`${haystack} ILIKE ${"%" + likeEscape(t) + "%"}`);
    const compactClause = parsed.compact
      ? sql`replace(lower(${listings.title}), ' ', '') LIKE ${"%" + likeEscape(parsed.compact) + "%"}`
      : null;
    if (termClauses.length > 0) {
      const allTerms = sql.join(termClauses, sql` AND `);
      conditions.push(compactClause ? sql`((${allTerms}) OR ${compactClause})` : sql`(${allTerms})`);
    }
    // Rank: exact phrase in title, then all terms in title, then the rest.
    const phrasePat = "%" + likeEscape(parsed.phrase) + "%";
    const titleTerms = parsed.terms.length
      ? sql.join(parsed.terms.map((t) => sql`${listings.title} ILIKE ${"%" + likeEscape(t) + "%"}`), sql` AND `)
      : sql`false`;
    relevance = sql`(CASE WHEN ${listings.title} ILIKE ${phrasePat} THEN 0 WHEN ${titleTerms} THEN 1 ELSE 2 END)`;
  }

  if (f.cuisine) {
    const parsed = parseSearchQuery(f.cuisine);
    for (const t of parsed.terms) {
      conditions.push(sql`${haystack} ILIKE ${"%" + likeEscape(t) + "%"}`);
    }
  }

  if (f.minPrice != null) conditions.push(sql`${usdPrice} >= ${f.minPrice}`);
  if (f.maxPrice != null) conditions.push(sql`${usdPrice} <= ${f.maxPrice}`);
  if (f.minRating != null) conditions.push(gte(listings.avgRating, String(f.minRating)));

  if (f.guests != null) {
    // Imported stays carry a type-default capacity (4) that no business stated.
    // Their capacity is unknown, so they stay in the results; only a stay whose
    // business verified its ownership is held to its stated capacity.
    conditions.push(
      sql`(
        (${listings.type} = 'stay' AND ${stayFitsGuests(f.guests)})
        OR (${listings.type} IN ('tour', 'excursion') AND (
          ${listings.typeData}->>'groupSize' IS NULL
          OR (${importedListingInteger("groupSize")}) >= ${f.guests}
        ))
        OR (${listings.type} = 'dining' AND (
          ${listings.typeData}->>'partySize' IS NULL
          OR (${importedListingInteger("partySize")}) >= ${f.guests}
        ))
        OR (${listings.type} NOT IN ('stay', 'tour', 'excursion', 'dining'))
      )`,
    );
  }

  for (const amenity of f.amenities) {
    // type_data is a json column; json has no containment operator.
    conditions.push(sql`(${listings.typeData})::jsonb->'amenities' @> ${JSON.stringify([amenity])}::jsonb`);
  }

  const durationMinutes = importedListingInteger("durationMinutes");
  switch (f.duration) {
    case "under-2":
      conditions.push(sql`(${durationMinutes}) < 120`);
      break;
    case "2-4":
      conditions.push(sql`(${durationMinutes}) >= 120 AND (${durationMinutes}) <= 240`);
      break;
    case "4-8":
      conditions.push(sql`(${durationMinutes}) > 240 AND (${durationMinutes}) <= 480`);
      break;
    case "full-day":
      conditions.push(sql`(${durationMinutes}) > 480 AND (${importedMultiDay}) IS NOT TRUE`);
      break;
    case "multi-day":
      conditions.push(sql`(${importedMultiDay}) = true`);
      break;
  }

  return { where: and(...conditions)!, relevance };
}

function orderFor(f: ListingFilters, relevance: SQL | null, usdPrice: SQL, bookingsEnabled: boolean): SQL[] {
  // Recommended leads with what a traveler can act on: listings that take
  // online bookings, then businesses that verified their ownership, then
  // the public-data directory.
  const actionable: SQL[] = [
    ...(bookingsEnabled ? [sql`(${currentListingBookable()}) DESC`] : []),
    sql`(${currentListingClaimVerified()}) DESC`,
  ];
  const primary: SQL[] =
    f.sort === "price-asc" ? [sql`${usdPrice} ASC NULLS LAST`]
    : f.sort === "price-desc" ? [sql`${usdPrice} DESC NULLS LAST`]
    : f.sort === "rating" ? [sql`${listings.avgRating} DESC NULLS LAST`, sql`${listings.reviewCount} DESC NULLS LAST`]
    : f.sort === "newest" ? [sql`${listings.createdAt} DESC NULLS LAST`]
    : f.sort === "most-reviews" ? [sql`${listings.reviewCount} DESC NULLS LAST`, sql`${listings.avgRating} DESC NULLS LAST`]
    : [
        ...actionable,
        sql`${listings.isFeatured} DESC NULLS LAST`,
        sql`${listings.reviewCount} DESC NULLS LAST`,
        sql`${listings.avgRating} DESC NULLS LAST`,
      ];
  const order: SQL[] = relevance && f.sort === "recommended"
    ? [relevance, ...primary]
    : [...primary];
  // Deterministic paging: identical sort keys would otherwise let a row
  // appear on two pages (or on neither).
  order.push(asc(listings.id));
  return order;
}

// Ratings on imported listings are Google's. The detail page uses the same
// rule (listing-detail-client.tsx) — keep them in step.
const reviewSourceExpr = sql<"google" | "vakaygo">`
  CASE WHEN ${listings.typeData}->>'unclaimed' = 'true'
         OR ${listings.typeData}->>'source' = 'google-places'
       THEN 'google' ELSE 'vakaygo' END`;

export async function searchListings(f: ListingFilters, db: Db = createDb()): Promise<ListingResult[]> {
  const bookingsEnabled = await bookingLaunchEnabled();
  const needsPrice = f.minPrice != null || f.maxPrice != null || f.sort === "price-asc" || f.sort === "price-desc";
  const usdPrice = bookingsEnabled && needsPrice
    ? listingPriceInUsd((await getExchangeRates()).rates, currentListingBookable())
    : sql`NULL::numeric`;
  const { where, relevance } = buildWhere(f, bookingsEnabled, usdPrice);

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      headline: listings.headline,
      bookingEligible: bookingsEnabled ? currentListingBookable() : sql<boolean>`false`,
      priceAmount: listings.priceAmount,
      priceCurrency: listings.priceCurrency,
      priceUnit: listings.priceUnit,
      avgRating: listings.avgRating,
      reviewCount: listings.reviewCount,
      parish: listings.parish,
      isFeatured: listings.isFeatured,
      islandSlug: islands.slug,
      islandName: islands.name,
      latitude: listings.latitude,
      longitude: listings.longitude,
      reviewSource: reviewSourceExpr,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(where)
    .orderBy(...orderFor(f, relevance, usdPrice, bookingsEnabled))
    .limit(f.limit)
    .offset(f.offset);

  if (rows.length === 0) return [];

  // One image per listing: the primary if there is one, else the first by
  // sort order. Single round trip (was two).
  const ids = rows.map((r) => r.id);
  const images = await db
    .selectDistinctOn([media.listingId], { listingId: media.listingId, url: media.url })
    .from(media)
    .where(inArray(media.listingId, ids))
    .orderBy(media.listingId, desc(media.isPrimary), asc(media.sortOrder));
  const imageMap = new Map(images.map((i) => [i.listingId, i.url]));

  return rows.map((r) => ({
    ...r,
    ...(isQuarantinedLocation(r) ? { latitude: null, longitude: null } : {}),
    bookingEligible: r.bookingEligible === true,
    priceAmount: r.bookingEligible === true ? r.priceAmount : null,
    reviewSource: r.reviewSource === "google" ? "google" : "vakaygo",
    image: getImageUrl(imageMap.get(r.id)) || null,
  }));
}

export async function countListings(f: ListingFilters, db: Db = createDb()): Promise<number> {
  const bookingsEnabled = await bookingLaunchEnabled();
  const needsPrice = f.minPrice != null || f.maxPrice != null;
  const usdPrice = bookingsEnabled && needsPrice
    ? listingPriceInUsd((await getExchangeRates()).rates, currentListingBookable())
    : sql`NULL::numeric`;
  const { where } = buildWhere(f, bookingsEnabled, usdPrice);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(where);
  return row?.count ?? 0;
}

/**
 * Which narrowing controls can match anything. Date, price and price sort
 * only work where a listing takes online bookings; the amenity and
 * duration chips only where listings carry that data (as of November
 * 2026 none do). The page offers a control only when it can return
 * something, instead of a filter that empties every destination.
 */
export async function loadExploreCapabilities(db: Db = createDb()): Promise<ExploreCapabilities> {
  const bookingsEnabled = await bookingLaunchEnabled();
  const stayAmenities = sql`(${listings.type} = 'stay' AND CASE WHEN json_typeof(${listings.typeData}->'amenities') = 'array'
    THEN json_array_length(${listings.typeData}->'amenities') > 0 ELSE false END)`;
  const tourDuration = sql`(${listings.type} IN ('tour', 'excursion')
    AND ((${importedListingInteger("durationMinutes")}) IS NOT NULL OR (${importedMultiDay}) IS NOT NULL))`;
  const [bookable, data] = await Promise.all([
    bookingsEnabled
      ? db
          .selectDistinct({ island: islands.slug, type: listings.type })
          .from(listingOnboarding)
          .innerJoin(listings, eq(listingOnboarding.listingId, listings.id))
          .innerJoin(islands, eq(listings.islandId, islands.id))
          .where(and(
            isNotNull(listingOnboarding.activatedAt),
            publicDirectoryListings(),
            sql`vakaygo_listing_bookable(${listings.id})`,
          ))
      : Promise.resolve([]),
    db
      .select({
        amenityData: sql<boolean>`coalesce(bool_or(${stayAmenities}), false)`,
        durationData: sql<boolean>`coalesce(bool_or(${tourDuration}), false)`,
      })
      .from(listings)
      .where(and(eq(listings.status, "active"), inArray(listings.type, ["stay", "tour", "excursion"]))),
  ]);
  return {
    bookable: bookable.map((b) => ({ island: b.island, type: b.type })),
    amenityData: data[0]?.amenityData === true,
    durationData: data[0]?.durationData === true,
  };
}

export type ExploreData = {
  listings: ListingResult[];
  totalCount: number;
  island: { slug: string; name: string } | null;
  capabilities: ExploreCapabilities;
};

async function loadExploreData(f: ListingFilters): Promise<ExploreData> {
  const db = createDb();
  const [results, totalCount, islandRow, capabilities] = await Promise.all([
    searchListings(f, db),
    countListings(f, db),
    f.island
      ? db.select({ slug: islands.slug, name: islands.name }).from(islands).where(eq(islands.slug, f.island)).limit(1)
      : Promise.resolve([]),
    // A failed capability read hides the optional controls; it never fails the page.
    loadExploreCapabilities(db).catch(() => NO_EXPLORE_CAPABILITIES),
  ]);
  return { listings: results, totalCount, island: islandRow[0] ?? null, capabilities };
}

// Eligibility includes revocation and expiry. Never reuse a positive cached result.
export async function getExploreData(_key: string, f: ListingFilters): Promise<ExploreData> {
  return loadExploreData(f);
}

export function exploreCacheKey(f: ListingFilters): string {
  return filtersToSearchParams(f, { includePaging: true }).toString();
}
