import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands, users } from "@/drizzle/schema";
import { eq, and, ne, sql, asc } from "drizzle-orm";
import { getListingBookingEligibility } from "@/server/business-onboarding";
import { getImageUrl } from "@/lib/image-utils";
import { publicDirectoryListings } from "@/server/public-listing-eligibility";
import { publicListingTypeData } from "@/lib/listing-public-data";
import { currentListingBookable } from "@/server/listing-bookability-sql";
import { isQuarantinedLocation } from "@/server/location-quarantine";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/** Same-type public directory suggestions, ranked across the entire destination before limiting. */
export function similarListingsQuery(db: ReturnType<typeof getDb>, listing: Pick<typeof listings.$inferSelect, "id" | "type" | "islandId">) {
  return db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      priceAmount: listings.priceAmount,
      priceUnit: listings.priceUnit,
      avgRating: listings.avgRating,
      priceCurrency: listings.priceCurrency,
      reviewCount: listings.reviewCount,
      parish: listings.parish,
      latitude: listings.latitude,
      longitude: listings.longitude,
      islandSlug: islands.slug,
      bookingEligible: currentListingBookable(),
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(
      and(
        eq(listings.type, listing.type),
        publicDirectoryListings(),
        eq(listings.islandId, listing.islandId),
        ne(listings.id, listing.id)
      )
    )
    .orderBy(sql`${listings.avgRating} DESC NULLS LAST`, sql`${listings.reviewCount} DESC NULLS LAST`, asc(listings.id))
    .limit(6);
}

/**
 * Shared by /api/listings/[slug] and the server-rendered listing page —
 * the page passes the result to the client component as initial data so
 * crawlers get full HTML instead of a loading skeleton.
 */
export async function getListingDetail(slug: string, islandSlug?: string) {
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
      islandCountry: islands.country,
      claimVerified: sql<boolean>`vakaygo_listing_claim_verified(${listings.id})`,
      operatorName: users.businessName,
      operatorAvatar: users.avatarUrl,
      operatorId: users.id,
      operatorSuperhost: users.isSuperhost,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .innerJoin(users, eq(listings.operatorId, users.id))
    .where(and(eq(listings.slug, slug), islandSlug ? eq(islands.slug, islandSlug) : undefined, publicDirectoryListings()))
    .limit(1);

  if (!listing) return null;
  const eligibility = await getListingBookingEligibility(listing.id);

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

  const similar = await similarListingsQuery(db, listing);

  const similarWithImages = await Promise.all(
    similar.map(async (s) => {
      const [img] = await db
        .select({ url: media.url })
        .from(media)
        .where(and(eq(media.listingId, s.id), eq(media.isPrimary, true)))
        .limit(1);
      return { ...s, ...(isQuarantinedLocation(s) ? { latitude: null, longitude: null } : {}), image: getImageUrl(img?.url) || null };
    })
  );

  const sanitizedTypeData = publicListingTypeData(listing.typeData);

  return {
    listing: {
      ...listing,
      ...(isQuarantinedLocation(listing) ? { latitude: null, longitude: null } : {}),
      ...(isQuarantinedLocation({ id: listing.id, latitude: listing.meetingPointLat, longitude: listing.meetingPointLng })
        ? { meetingPointLat: null, meetingPointLng: null } : {}),
      typeData: sanitizedTypeData,
      images,
      bookingEligible: eligibility.eligible === true,
      bookingEligibilityReason: eligibility.reason,
      isInstantBook: eligibility.eligible === true && listing.isInstantBook === true,
    },
    similar: similarWithImages,
  };
}
