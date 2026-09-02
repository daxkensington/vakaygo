import { unstable_cache } from "next/cache";
import { createDb } from "@/server/db";
import { listings, islands, media, availability } from "@/drizzle/schema";
import { eq, and, desc, asc, gte, lte, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";
import { parseSearchQuery, likeEscape } from "@/lib/search-terms";
import {
  filtersToSearchParams,
  type ListingFilters,
  type ListingResult,
} from "@/lib/listing-filters";

/**
 * Listing search shared by the /explore page (server-rendered) and the
 * /api/listings + /api/listings/count routes. One place decides what a
 * filter means, so the cards, the count and the HTML always agree.
 */

type Db = ReturnType<typeof createDb>;

function buildWhere(db: Db, f: ListingFilters): { where: SQL; relevance: SQL | null } {
  const conditions: SQL[] = [eq(listings.status, "active")];

  if (f.type) conditions.push(eq(listings.type, f.type));

  // Subquery instead of a round trip; an unknown island slug yields no
  // rows rather than silently showing every island.
  if (f.island) {
    conditions.push(
      sql`${listings.islandId} = (select ${islands.id} from ${islands} where ${islands.slug} = ${f.island} limit 1)`,
    );
  }

  if (f.date) {
    const unavailable = db
      .select({ id: availability.listingId })
      .from(availability)
      .where(
        and(
          eq(availability.date, new Date(f.date)),
          sql`(${availability.isBlocked} = true OR ${availability.spotsRemaining} = 0)`,
        ),
      );
    conditions.push(notInArray(listings.id, unavailable));
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

  if (f.minPrice != null) conditions.push(gte(listings.priceAmount, String(f.minPrice)));
  if (f.maxPrice != null) conditions.push(lte(listings.priceAmount, String(f.maxPrice)));
  if (f.minRating != null) conditions.push(gte(listings.avgRating, String(f.minRating)));

  if (f.guests != null) {
    conditions.push(
      sql`(
        (${listings.type} = 'stay' AND (${listings.typeData}->>'maxGuests')::int >= ${f.guests})
        OR (${listings.type} IN ('tour', 'excursion') AND (
          ${listings.typeData}->>'groupSize' IS NULL
          OR (${listings.typeData}->>'groupSize')::int >= ${f.guests}
        ))
        OR (${listings.type} = 'dining' AND (
          ${listings.typeData}->>'partySize' IS NULL
          OR (${listings.typeData}->>'partySize')::int >= ${f.guests}
        ))
        OR (${listings.type} NOT IN ('stay', 'tour', 'excursion', 'dining'))
      )`,
    );
  }

  for (const amenity of f.amenities) {
    conditions.push(sql`${listings.typeData}->'amenities' @> ${JSON.stringify([amenity])}::jsonb`);
  }

  switch (f.duration) {
    case "under-2":
      conditions.push(sql`(${listings.typeData}->>'durationMinutes')::int < 120`);
      break;
    case "2-4":
      conditions.push(sql`(${listings.typeData}->>'durationMinutes')::int >= 120 AND (${listings.typeData}->>'durationMinutes')::int <= 240`);
      break;
    case "4-8":
      conditions.push(sql`(${listings.typeData}->>'durationMinutes')::int > 240 AND (${listings.typeData}->>'durationMinutes')::int <= 480`);
      break;
    case "full-day":
      conditions.push(sql`(${listings.typeData}->>'durationMinutes')::int > 480 AND (${listings.typeData}->>'isMultiDay')::boolean IS NOT TRUE`);
      break;
    case "multi-day":
      conditions.push(sql`(${listings.typeData}->>'isMultiDay')::boolean = true`);
      break;
  }

  return { where: and(...conditions)!, relevance };
}

function orderFor(f: ListingFilters, relevance: SQL | null): SQL[] {
  const primary =
    f.sort === "price-asc" ? asc(listings.priceAmount)
    : f.sort === "price-desc" ? desc(listings.priceAmount)
    : f.sort === "rating" ? desc(listings.avgRating)
    : f.sort === "newest" ? desc(listings.createdAt)
    : f.sort === "most-reviews" ? desc(listings.reviewCount)
    : desc(listings.isFeatured);
  const order: SQL[] = relevance && f.sort === "recommended"
    ? [relevance, primary, desc(listings.reviewCount)]
    : [primary];
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
  const { where, relevance } = buildWhere(db, f);

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      headline: listings.headline,
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
    .orderBy(...orderFor(f, relevance))
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
    reviewSource: r.reviewSource === "google" ? "google" : "vakaygo",
    image: getImageUrl(imageMap.get(r.id)) || null,
  }));
}

export async function countListings(f: ListingFilters, db: Db = createDb()): Promise<number> {
  const { where } = buildWhere(db, f);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .where(where);
  return row?.count ?? 0;
}

export type ExploreData = {
  listings: ListingResult[];
  totalCount: number;
  island: { slug: string; name: string } | null;
};

async function loadExploreData(f: ListingFilters): Promise<ExploreData> {
  const db = createDb();
  const [results, totalCount, islandRow] = await Promise.all([
    searchListings(f, db),
    countListings(f, db),
    f.island
      ? db.select({ slug: islands.slug, name: islands.name }).from(islands).where(eq(islands.slug, f.island)).limit(1)
      : Promise.resolve([]),
  ]);
  return { listings: results, totalCount, island: islandRow[0] ?? null };
}

/**
 * Explore page data, cached for an hour per distinct filter set. The page
 * itself is dynamic (it reads searchParams), so this is what keeps the
 * common landings — /explore, /explore?island=grenada&type=stay — off the
 * database. Revalidate with `revalidateTag("listings")` when the catalogue
 * changes.
 */
export const getExploreData = unstable_cache(
  // The canonical query string is the cache key; the filters travel with it.
  async (_key: string, f: ListingFilters) => loadExploreData(f),
  ["explore-data-v1"],
  { revalidate: 3600, tags: ["listings"] },
);

export function exploreCacheKey(f: ListingFilters): string {
  return filtersToSearchParams(f, { includePaging: true }).toString();
}
