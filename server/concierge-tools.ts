import { createDb } from "@/server/db";
import { listings, islands, media, reviews, availability, users } from "@/drizzle/schema";
import { eq, and, sql, gte, lte, ilike, desc, asc } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

// ─── Types ──────────────────────────────────────────────────────
type SearchParams = {
  type?: string;
  island?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  limit?: number;
};

type ListingDetailsParams = {
  slug: string;
  island: string;
};

type AvailabilityParams = {
  listingId: string;
  date: string;
};

type IslandInfoParams = {
  island: string;
};

type CompareParams = {
  slugs: string[];
  island: string;
};

// ─── Search Listings ────────────────────────────────────────────
export async function searchListings(params: SearchParams) {
  const db = createDb();
  const limit = Math.min(params.limit || 5, 10);

  const conditions = [eq(listings.status, "active")];

  if (params.type) {
    conditions.push(eq(listings.type, params.type as typeof listings.type.enumValues[number]));
  }

  if (params.q) {
    conditions.push(
      sql`(${ilike(listings.title, `%${params.q}%`)} OR ${ilike(listings.description, `%${params.q}%`)})`
    );
  }

  if (params.minPrice !== undefined) {
    conditions.push(gte(listings.priceAmount, String(params.minPrice)));
  }

  if (params.maxPrice !== undefined) {
    conditions.push(lte(listings.priceAmount, String(params.maxPrice)));
  }

  if (params.minRating !== undefined) {
    conditions.push(gte(listings.avgRating, String(params.minRating)));
  }

  // Build a subquery for island filtering
  let islandCondition: ReturnType<typeof eq> | undefined;
  if (params.island) {
    islandCondition = eq(islands.slug, params.island);
  }

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
      isFeatured: listings.isFeatured,
      isInstantBook: listings.isInstantBook,
      islandSlug: islands.slug,
      islandName: islands.name,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(
      islandCondition
        ? and(...conditions, islandCondition)
        : and(...conditions)
    )
    .orderBy(desc(listings.isFeatured), desc(listings.avgRating))
    .limit(limit);

  // Fetch primary images for each listing
  const listingIds = results.map((r) => r.id);
  let imageMap: Record<string, string> = {};

  if (listingIds.length > 0) {
    const images = await db
      .select({
        listingId: media.listingId,
        url: media.url,
      })
      .from(media)
      .where(
        and(
          sql`${media.listingId} IN ${listingIds}`,
          eq(media.isPrimary, true)
        )
      );

    // Fallback: get first image for listings without a primary
    const withPrimary = new Set(images.map((i) => i.listingId));
    const missingIds = listingIds.filter((id) => !withPrimary.has(id));

    if (missingIds.length > 0) {
      const fallbackImages = await db
        .select({
          listingId: media.listingId,
          url: media.url,
        })
        .from(media)
        .where(sql`${media.listingId} IN ${missingIds}`)
        .orderBy(asc(media.sortOrder))
        .limit(missingIds.length);

      images.push(...fallbackImages);
    }

    imageMap = Object.fromEntries(images.map((i) => [i.listingId, i.url]));
  }

  return results.map((r) => ({
    title: r.title,
    slug: r.slug,
    island: r.islandSlug,
    islandName: r.islandName,
    type: r.type,
    price: r.priceAmount ? parseFloat(r.priceAmount) : null,
    currency: r.priceCurrency || "XCD",
    priceUnit: r.priceUnit,
    rating: r.avgRating ? parseFloat(r.avgRating) : null,
    reviewCount: r.reviewCount || 0,
    parish: r.parish,
    headline: r.headline,
    image: getImageUrl(imageMap[r.id]) || null,
    url: `/${r.islandSlug}/${r.slug}`,
    isFeatured: r.isFeatured,
    isInstantBook: r.isInstantBook,
  }));
}

// ─── Get Listing Details ────────────────────────────────────────
export async function getListingDetails(params: ListingDetailsParams) {
  const db = createDb();

  const results = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      headline: listings.headline,
      description: listings.description,
      address: listings.address,
      parish: listings.parish,
      priceAmount: listings.priceAmount,
      priceCurrency: listings.priceCurrency,
      priceUnit: listings.priceUnit,
      avgRating: listings.avgRating,
      reviewCount: listings.reviewCount,
      isFeatured: listings.isFeatured,
      isInstantBook: listings.isInstantBook,
      typeData: listings.typeData,
      cancellationPolicy: listings.cancellationPolicy,
      maxGuests: listings.maxGuests,
      islandSlug: islands.slug,
      islandName: islands.name,
      operatorName: users.name,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .innerJoin(users, eq(listings.operatorId, users.id))
    .where(
      and(
        eq(listings.slug, params.slug),
        eq(islands.slug, params.island),
        eq(listings.status, "active")
      )
    )
    .limit(1);

  if (results.length === 0) {
    return { error: "Listing not found" };
  }

  const listing = results[0];

  // Get images
  const images = await db
    .select({ url: media.url, alt: media.alt })
    .from(media)
    .where(eq(media.listingId, listing.id))
    .orderBy(asc(media.sortOrder))
    .limit(5);

  // Get recent reviews
  const recentReviews = await db
    .select({
      rating: reviews.rating,
      title: reviews.title,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(eq(reviews.listingId, listing.id), eq(reviews.isPublished, true)))
    .orderBy(desc(reviews.createdAt))
    .limit(3);

  return {
    title: listing.title,
    slug: listing.slug,
    type: listing.type,
    headline: listing.headline,
    description: listing.description,
    address: listing.address,
    parish: listing.parish,
    price: listing.priceAmount ? parseFloat(listing.priceAmount) : null,
    currency: listing.priceCurrency || "XCD",
    priceUnit: listing.priceUnit,
    rating: listing.avgRating ? parseFloat(listing.avgRating) : null,
    reviewCount: listing.reviewCount || 0,
    island: listing.islandSlug,
    islandName: listing.islandName,
    operatorName: listing.operatorName,
    isFeatured: listing.isFeatured,
    isInstantBook: listing.isInstantBook,
    cancellationPolicy: listing.cancellationPolicy,
    maxGuests: listing.maxGuests,
    typeData: listing.typeData,
    images: images.map((i) => getImageUrl(i.url)).filter(Boolean),
    url: `/${listing.islandSlug}/${listing.slug}`,
    recentReviews: recentReviews.map((r) => ({
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      date: r.createdAt.toISOString().split("T")[0],
    })),
  };
}

// ─── Check Availability ─────────────────────────────────────────
export async function checkAvailability(params: AvailabilityParams) {
  const db = createDb();
  const targetDate = new Date(params.date);

  const results = await db
    .select({
      spots: availability.spots,
      spotsRemaining: availability.spotsRemaining,
      priceOverride: availability.priceOverride,
      isBlocked: availability.isBlocked,
    })
    .from(availability)
    .where(
      and(
        eq(availability.listingId, params.listingId),
        eq(availability.date, targetDate)
      )
    )
    .limit(1);

  if (results.length === 0) {
    // No availability record means default availability (open)
    return {
      available: true,
      message: "No specific restrictions set for this date — default availability applies.",
    };
  }

  const row = results[0];

  if (row.isBlocked) {
    return {
      available: false,
      message: "This listing is not available on the requested date.",
    };
  }

  if (row.spotsRemaining !== null && row.spotsRemaining <= 0) {
    return {
      available: false,
      message: "Fully booked on this date.",
    };
  }

  return {
    available: true,
    spotsRemaining: row.spotsRemaining,
    priceOverride: row.priceOverride ? parseFloat(row.priceOverride) : null,
    message: row.spotsRemaining
      ? `Available! ${row.spotsRemaining} spot${row.spotsRemaining > 1 ? "s" : ""} remaining.`
      : "Available on this date!",
  };
}

// ─── Get Island Info ────────────────────────────────────────────
export async function getIslandInfo(params: IslandInfoParams) {
  const db = createDb();

  const islandResults = await db
    .select({
      id: islands.id,
      name: islands.name,
      slug: islands.slug,
      country: islands.country,
      description: islands.description,
      heroImage: islands.heroImage,
      currency: islands.currency,
      timezone: islands.timezone,
    })
    .from(islands)
    .where(eq(islands.slug, params.island))
    .limit(1);

  if (islandResults.length === 0) {
    return { error: `Island "${params.island}" not found.` };
  }

  const island = islandResults[0];

  // Count listings by type
  const typeCounts = await db
    .select({
      type: listings.type,
      count: sql<number>`count(*)::int`,
    })
    .from(listings)
    .where(
      and(eq(listings.islandId, island.id), eq(listings.status, "active"))
    )
    .groupBy(listings.type);

  // Top rated listings
  const topRated = await db
    .select({
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      avgRating: listings.avgRating,
      reviewCount: listings.reviewCount,
      priceAmount: listings.priceAmount,
      priceUnit: listings.priceUnit,
    })
    .from(listings)
    .where(
      and(
        eq(listings.islandId, island.id),
        eq(listings.status, "active"),
        gte(listings.reviewCount, 1)
      )
    )
    .orderBy(desc(listings.avgRating))
    .limit(5);

  const totalListings = typeCounts.reduce((sum, t) => sum + t.count, 0);

  return {
    name: island.name,
    slug: island.slug,
    country: island.country,
    description: island.description,
    currency: island.currency,
    timezone: island.timezone,
    heroImage: island.heroImage,
    totalListings,
    listingsByType: Object.fromEntries(
      typeCounts.map((t) => [t.type, t.count])
    ),
    topRated: topRated.map((l) => ({
      title: l.title,
      slug: l.slug,
      type: l.type,
      rating: l.avgRating ? parseFloat(l.avgRating) : null,
      reviewCount: l.reviewCount || 0,
      price: l.priceAmount ? parseFloat(l.priceAmount) : null,
      priceUnit: l.priceUnit,
      url: `/${island.slug}/${l.slug}`,
    })),
  };
}

// ─── Compare Listings ───────────────────────────────────────────
export async function compareListings(params: CompareParams) {
  const db = createDb();

  const slugList = params.slugs.slice(0, 3); // max 3

  const results = await db
    .select({
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
      isInstantBook: listings.isInstantBook,
      cancellationPolicy: listings.cancellationPolicy,
      maxGuests: listings.maxGuests,
      typeData: listings.typeData,
      islandSlug: islands.slug,
      islandName: islands.name,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(
      and(
        sql`${listings.slug} IN ${slugList}`,
        eq(islands.slug, params.island),
        eq(listings.status, "active")
      )
    );

  return results.map((r) => ({
    title: r.title,
    slug: r.slug,
    type: r.type,
    headline: r.headline,
    price: r.priceAmount ? parseFloat(r.priceAmount) : null,
    currency: r.priceCurrency || "XCD",
    priceUnit: r.priceUnit,
    rating: r.avgRating ? parseFloat(r.avgRating) : null,
    reviewCount: r.reviewCount || 0,
    parish: r.parish,
    island: r.islandSlug,
    islandName: r.islandName,
    isFeatured: r.isFeatured,
    isInstantBook: r.isInstantBook,
    cancellationPolicy: r.cancellationPolicy,
    maxGuests: r.maxGuests,
    typeData: r.typeData,
    url: `/${r.islandSlug}/${r.slug}`,
  }));
}
