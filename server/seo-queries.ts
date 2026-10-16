import { cache } from "react";
import { createDb } from "@/server/db";
import { islands, listings, media, listingTypeEnum } from "@/drizzle/schema";
import { eq, and, sql, count, avg } from "drizzle-orm";

import { publicDirectoryListings, publicDestinations as publicIsland } from "@/server/public-listing-eligibility";

export type SeoListing = {
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
  image: string | null;
  islandSlug: string;
  islandName: string;
  typeData: Record<string, unknown> | null;
};

export type IslandSeoData = {
  id: number;
  slug: string;
  name: string;
  country: string;
  description: string | null;
  heroImage: string | null;
  region: string | null;
};

export type IslandStats = {
  totalListings: number;
  avgRating: number;
  typeCounts: Record<string, number>;
};

/** Get all active islands for generateStaticParams */
export async function getActiveIslands(): Promise<IslandSeoData[]> {
  const db = createDb();
  return db
    .select({
      id: islands.id,
      slug: islands.slug,
      name: islands.name,
      country: islands.country,
      description: islands.description,
      heroImage: islands.heroImage,
      region: islands.region,
    })
    .from(islands)
    .where(publicIsland())
    .orderBy(islands.sortOrder);
}

/** Active islands + count of active listings each, sorted by sortOrder. */
export async function getActiveIslandsWithCounts(): Promise<
  Array<IslandSeoData & { listingCount: number }>
> {
  const db = createDb();
  const rows = await db
    .select({
      id: islands.id,
      slug: islands.slug,
      name: islands.name,
      country: islands.country,
      description: islands.description,
      heroImage: islands.heroImage,
      region: islands.region,
      sortOrder: islands.sortOrder,
      listingCount: sql<number>`COUNT(CASE WHEN ${publicDirectoryListings()} THEN 1 END)::int`,
    })
    .from(islands)
    .leftJoin(listings, eq(listings.islandId, islands.id))
    .where(publicIsland())
    .groupBy(islands.id)
    .orderBy(islands.sortOrder);
  return rows.map(({ sortOrder: _s, ...rest }) => rest);
}

export type ListingSeoMeta = {
  id: string;
  title: string;
  slug: string;
  type: string;
  headline: string | null;
  description: string | null;
  parish: string | null;
  primaryImage: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  islandSlug: string;
  islandName: string;
  status: string;
};

/**
 * Resolve a listing by its (islandSlug, slug) pair for SEO/server gating.
 * Returns null when the listing doesn't exist OR isn't on the named island
 * OR isn't active. Used by the listing detail layout to issue a real 404.
 * cache()'d so generateMetadata + the layout share one DB query per request.
 */
export const getListingForSeo = cache(
  async (
    islandSlug: string,
    listingSlug: string
  ): Promise<ListingSeoMeta | null> => {
    const db = createDb();
    const [row] = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        headline: listings.headline,
        description: listings.description,
        parish: listings.parish,
        primaryImage: sql<string | null>`(
          SELECT m.url FROM media m
          WHERE m.listing_id = ${listings.id}
          ORDER BY m.is_primary DESC, m.sort_order ASC
          LIMIT 1
        )`,
        metaTitle: listings.metaTitle,
        metaDescription: listings.metaDescription,
        islandSlug: islands.slug,
        islandName: islands.name,
        status: listings.status,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(
        and(
          eq(listings.slug, listingSlug),
          eq(islands.slug, islandSlug),
          publicDirectoryListings()
        )
      )
      .limit(1);
    return row || null;
  }
);

/**
 * Get island by slug. Wrapped in React cache() so the layout's metadata
 * lookup and the layout's auth gate share one DB query per request.
 */
export const getIslandBySlug = cache(
  async (slug: string): Promise<IslandSeoData | null> => {
    const db = createDb();
    const results = await db
      .select({
        id: islands.id,
        slug: islands.slug,
        name: islands.name,
        country: islands.country,
        description: islands.description,
        heroImage: islands.heroImage,
        region: islands.region,
      })
      .from(islands)
      .where(and(eq(islands.slug, slug), publicIsland()))
      .limit(1);
    return results[0] || null;
  }
);

/** Get top listings by type for an island, sorted by rating */
export async function getTopListingsByType(
  islandId: number,
  type: string,
  limit = 6
): Promise<SeoListing[]> {
  const listingType = listingTypeEnum.enumValues.find(value => value === type);
  if (!listingType) return [];
  const db = createDb();
  const results = await db
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
      typeData: listings.typeData,
      islandSlug: islands.slug,
      islandName: islands.name,
      image: media.url,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .leftJoin(
      media,
      and(eq(media.listingId, listings.id), eq(media.isPrimary, true))
    )
    .where(
      and(
        eq(listings.islandId, islandId),
        eq(listings.type, listingType),
        publicDirectoryListings()
      )
    )
    .orderBy(
      sql`${listings.isFeatured} DESC NULLS LAST`,
      sql`${listings.avgRating} DESC NULLS LAST`,
      sql`${listings.reviewCount} DESC NULLS LAST`
    )
    .limit(limit);

  return results;
}

/** Get all active listings for an island, sorted by rating */
export async function getTopListingsForIsland(
  islandId: number,
  limit = 12
): Promise<SeoListing[]> {
  const db = createDb();
  return db
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
      typeData: listings.typeData,
      islandSlug: islands.slug,
      islandName: islands.name,
      image: media.url,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .leftJoin(
      media,
      and(eq(media.listingId, listings.id), eq(media.isPrimary, true))
    )
    .where(
      and(
        eq(listings.islandId, islandId),
        publicDirectoryListings()
      )
    )
    .orderBy(
      sql`${listings.isFeatured} DESC NULLS LAST`,
      sql`${listings.avgRating} DESC NULLS LAST`,
      sql`${listings.reviewCount} DESC NULLS LAST`
    )
    .limit(limit);
}

/**
 * Lightweight: every active listing's slug/title/type for an island, A→Z.
 * Powers the SSR "Browse all experiences" crawl index on the island hub so
 * Googlebot can reach every listing in 2 clicks from the homepage (no media
 * join, no limit — kept cheap).
 */
export async function getAllListingSlugsForIsland(
  islandId: number
): Promise<Array<{ slug: string; title: string; type: string }>> {
  const db = createDb();
  return db
    .select({
      slug: listings.slug,
      title: listings.title,
      type: listings.type,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(and(eq(listings.islandId, islandId), publicDirectoryListings()))
    .orderBy(listings.title);
}

/** Get island stats: listing counts by type and average rating */
export async function getIslandStats(islandId: number): Promise<IslandStats> {
  const db = createDb();

  const typeCountResults = await db
    .select({
      type: listings.type,
      count: count(),
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(
      and(eq(listings.islandId, islandId), publicDirectoryListings())
    )
    .groupBy(listings.type);

  const ratingResult = await db
    .select({
      avgRating: avg(listings.avgRating),
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(
      and(eq(listings.islandId, islandId), publicDirectoryListings())
    );

  const typeCounts: Record<string, number> = {};
  let totalListings = 0;
  for (const row of typeCountResults) {
    typeCounts[row.type] = row.count;
    totalListings += row.count;
  }

  return {
    totalListings,
    avgRating: ratingResult[0]?.avgRating
      ? parseFloat(ratingResult[0].avgRating)
      : 0,
    typeCounts,
  };
}

/** Get islands that have dining listings */
export async function getIslandsWithDining(): Promise<IslandSeoData[]> {
  const db = createDb();
  const results = await db
    .selectDistinct({
      id: islands.id,
      slug: islands.slug,
      name: islands.name,
      country: islands.country,
      description: islands.description,
      heroImage: islands.heroImage,
      region: islands.region,
      sortOrder: islands.sortOrder,
    })
    .from(islands)
    .innerJoin(listings, eq(listings.islandId, islands.id))
    .where(
      and(
        publicDirectoryListings(),
        eq(listings.type, "dining")
      )
    )
    .orderBy(islands.sortOrder);
  return results.map(({ sortOrder: _s, ...rest }) => rest);
}

/** Get islands that have stay listings */
export async function getIslandsWithStays(): Promise<IslandSeoData[]> {
  const db = createDb();
  const results = await db
    .selectDistinct({
      id: islands.id,
      slug: islands.slug,
      name: islands.name,
      country: islands.country,
      description: islands.description,
      heroImage: islands.heroImage,
      region: islands.region,
      sortOrder: islands.sortOrder,
    })
    .from(islands)
    .innerJoin(listings, eq(listings.islandId, islands.id))
    .where(
      and(
        publicDirectoryListings(),
        eq(listings.type, "stay")
      )
    )
    .orderBy(islands.sortOrder);
  return results.map(({ sortOrder: _s, ...rest }) => rest);
}
