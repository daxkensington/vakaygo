import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands, users } from "@/drizzle/schema";
import { eq, and, ne } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * Shared by /api/listings/[slug] and the server-rendered listing page —
 * the page passes the result to the client component as initial data so
 * crawlers get full HTML instead of a loading skeleton.
 */
export async function getListingDetail(slug: string) {
  const db = getDb();

  const [listing] = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      status: listings.status,
      headline: listings.headline,
      description: listings.description,
      address: listings.address,
      latitude: listings.latitude,
      longitude: listings.longitude,
      parish: listings.parish,
      priceAmount: listings.priceAmount,
      priceCurrency: listings.priceCurrency,
      priceUnit: listings.priceUnit,
      priceFrom: listings.priceFrom,
      typeData: listings.typeData,
      avgRating: listings.avgRating,
      reviewCount: listings.reviewCount,
      isFeatured: listings.isFeatured,
      isInstantBook: listings.isInstantBook,
      cancellationPolicy: listings.cancellationPolicy,
      minStay: listings.minStay,
      maxStay: listings.maxStay,
      advanceNotice: listings.advanceNotice,
      maxGuests: listings.maxGuests,
      meetingPointLat: listings.meetingPointLat,
      meetingPointLng: listings.meetingPointLng,
      meetingPointNote: listings.meetingPointNote,
      createdAt: listings.createdAt,
      islandId: listings.islandId,
      islandSlug: islands.slug,
      islandName: islands.name,
      operatorName: users.businessName,
      operatorAvatar: users.avatarUrl,
      operatorId: users.id,
      operatorSuperhost: users.isSuperhost,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .innerJoin(users, eq(listings.operatorId, users.id))
    .where(and(eq(listings.slug, slug), eq(listings.status, "active")))
    .limit(1);

  if (!listing) return null;

  const rawImages = await db
    .select({
      id: media.id,
      url: media.url,
      alt: media.alt,
      type: media.type,
      isPrimary: media.isPrimary,
      sortOrder: media.sortOrder,
    })
    .from(media)
    .where(eq(media.listingId, listing.id))
    .orderBy(media.sortOrder);

  const images = rawImages.map((img) => ({
    ...img,
    url: img.type === "video" ? img.url : (getImageUrl(img.url) || img.url),
  }));

  // Similar = same type on the SAME island (the old query's island
  // condition was a join tautology, so it matched any island).
  const similar = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      priceAmount: listings.priceAmount,
      priceUnit: listings.priceUnit,
      avgRating: listings.avgRating,
      reviewCount: listings.reviewCount,
      parish: listings.parish,
      islandSlug: islands.slug,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(
      and(
        eq(listings.type, listing.type),
        eq(listings.status, "active"),
        eq(listings.islandId, listing.islandId),
        ne(listings.id, listing.id)
      )
    )
    .limit(3);

  const similarWithImages = await Promise.all(
    similar.map(async (s) => {
      const [img] = await db
        .select({ url: media.url })
        .from(media)
        .where(and(eq(media.listingId, s.id), eq(media.isPrimary, true)))
        .limit(1);
      return { ...s, image: getImageUrl(img?.url) || null };
    })
  );

  return {
    listing: { ...listing, images },
    similar: similarWithImages,
  };
}
