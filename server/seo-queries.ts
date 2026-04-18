import { createDb } from "@/server/db";
import { islands, listings, media, categories } from "@/drizzle/schema";
import { eq, and, desc, sql, count, avg } from "drizzle-orm";

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
    .where(eq(islands.isActive, true))
    .orderBy(islands.sortOrder);
}

/** Get island by slug */
export async function getIslandBySlug(slug: string): Promise<IslandSeoData | null> {
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
    .where(eq(islands.slug, slug))
    .limit(1);
  return results[0] || null;
}

/** Get top listings by type for an island, sorted by rating */
export async function getTopListingsByType(
  islandId: number,
  type: string,
  limit = 6
): Promise<SeoListing[]> {
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
        eq(listings.type, type as any),
        eq(listings.status, "active")
      )
    )
    .orderBy(desc(listings.avgRating), desc(listings.reviewCount))
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
      and(eq(listings.islandId, islandId), eq(listings.status, "active"))
    )
    .orderBy(desc(listings.avgRating), desc(listings.reviewCount))
    .limit(limit);
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
    .where(
      and(eq(listings.islandId, islandId), eq(listings.status, "active"))
    )
    .groupBy(listings.type);

  const ratingResult = await db
    .select({
      avgRating: avg(listings.avgRating),
    })
    .from(listings)
    .where(
      and(eq(listings.islandId, islandId), eq(listings.status, "active"))
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
        eq(islands.isActive, true),
        eq(listings.type, "dining"),
        eq(listings.status, "active")
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
        eq(islands.isActive, true),
        eq(listings.type, "stay"),
        eq(listings.status, "active")
      )
    )
    .orderBy(islands.sortOrder);
  return results.map(({ sortOrder: _s, ...rest }) => rest);
}
