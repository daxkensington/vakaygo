import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, islands, media, availability } from "@/drizzle/schema";
import { eq, and, ilike, lte, gte, inArray, sql } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export type SearchListingsParams = {
  type?: string;
  island?: string;
  q?: string;
  maxPrice?: number;
  minRating?: number;
  limit?: number;
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
  islandSlug: string;
  islandName: string;
  image: string | null;
};

export async function searchListings(params: SearchListingsParams): Promise<ListingResult[]> {
  const db = getDb();
  const conditions = [eq(listings.status, "active")];

  if (params.type && params.type !== "all") {
    conditions.push(
      eq(listings.type, params.type as "stay" | "tour" | "dining" | "event" | "transport" | "guide" | "excursion" | "transfer" | "vip")
    );
  }

  if (params.island) {
    const [islandRow] = await db
      .select({ id: islands.id })
      .from(islands)
      .where(eq(islands.slug, params.island))
      .limit(1);
    if (islandRow) {
      conditions.push(eq(listings.islandId, islandRow.id));
    }
  }

  if (params.q) {
    conditions.push(ilike(listings.title, `%${params.q}%`));
  }

  if (params.maxPrice) {
    conditions.push(lte(listings.priceAmount, String(params.maxPrice)));
  }

  if (params.minRating) {
    conditions.push(gte(listings.avgRating, String(params.minRating)));
  }

  const limit = Math.min(params.limit || 10, 20);

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
      islandSlug: islands.slug,
      islandName: islands.name,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(and(...conditions))
    .orderBy(sql`${listings.avgRating} DESC NULLS LAST`)
    .limit(limit);

  // Get primary images
  const listingIds = results.map((r) => r.id);
  const imageMap = new Map<string, string>();
  if (listingIds.length > 0) {
    const images = await db
      .select({ listingId: media.listingId, url: media.url })
      .from(media)
      .where(and(inArray(media.listingId, listingIds), eq(media.isPrimary, true)));
    images.forEach((img) => imageMap.set(img.listingId, getImageUrl(img.url) || img.url));
  }

  return results.map((r) => ({
    ...r,
    image: imageMap.get(r.id) || null,
  }));
}

export async function getListingDetails(listingId: string): Promise<ListingResult | null> {
  const db = getDb();

  const [result] = await db
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
      islandSlug: islands.slug,
      islandName: islands.name,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!result) return null;

  const images = await db
    .select({ url: media.url })
    .from(media)
    .where(and(eq(media.listingId, listingId), eq(media.isPrimary, true)))
    .limit(1);

  return {
    ...result,
    image: images[0] ? getImageUrl(images[0].url) || images[0].url : null,
  };
}

export async function checkAvailability(listingId: string, date: string): Promise<{ available: boolean; spotsRemaining: number | null; priceOverride: string | null }> {
  const db = getDb();

  const [record] = await db
    .select({
      isBlocked: availability.isBlocked,
      spotsRemaining: availability.spotsRemaining,
      priceOverride: availability.priceOverride,
    })
    .from(availability)
    .where(
      and(
        eq(availability.listingId, listingId),
        eq(availability.date, new Date(date))
      )
    )
    .limit(1);

  if (!record) {
    // No availability record means it's available by default
    return { available: true, spotsRemaining: null, priceOverride: null };
  }

  return {
    available: !record.isBlocked && (record.spotsRemaining === null || record.spotsRemaining > 0),
    spotsRemaining: record.spotsRemaining,
    priceOverride: record.priceOverride,
  };
}
