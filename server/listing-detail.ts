import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands, users } from "@/drizzle/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { getListingBookingEligibility } from "@/server/business-onboarding";
import { getImageUrl } from "@/lib/image-utils";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
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
    .where(and(eq(listings.slug, slug), islandSlug ? eq(islands.slug, islandSlug) : undefined, eq(islands.isActive, true), eq(listings.status, "active"), ne(listings.operatorId, "197d8586-7fd3-4999-91de-a50ad7d70e23")))
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

  // Similar = same type on the SAME island, sorted by proximity when coordinates exist
  const rawSimilar = await db
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
      latitude: listings.latitude,
      longitude: listings.longitude,
      islandSlug: islands.slug,
      bookingEligible: sql<boolean>`vakaygo_listing_bookable(${listings.id})`,
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
    .limit(24);

  const originLat = listing.latitude ? parseFloat(listing.latitude) : NaN;
  const originLng = listing.longitude ? parseFloat(listing.longitude) : NaN;
  const hasOriginCoords = Number.isFinite(originLat) && Number.isFinite(originLng);

  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const similar = [...rawSimilar]
    .sort((a, b) => {
      if (hasOriginCoords) {
        const aLat = a.latitude ? parseFloat(a.latitude) : NaN;
        const aLng = a.longitude ? parseFloat(a.longitude) : NaN;
        const bLat = b.latitude ? parseFloat(b.latitude) : NaN;
        const bLng = b.longitude ? parseFloat(b.longitude) : NaN;
        const aDist = Number.isFinite(aLat) && Number.isFinite(aLng) ? haversineKm(originLat, originLng, aLat, aLng) : 9999;
        const bDist = Number.isFinite(bLat) && Number.isFinite(bLng) ? haversineKm(originLat, originLng, bLat, bLng) : 9999;
        if (Math.abs(aDist - bDist) > 0.2) return aDist - bDist;
      }
      const aRating = a.avgRating ? parseFloat(a.avgRating) : 0;
      const bRating = b.avgRating ? parseFloat(b.avgRating) : 0;
      return bRating - aRating;
    })
    .slice(0, 6);

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

  const sanitizedTypeData =
    listing.typeData && typeof listing.typeData === "object"
      ? (() => {
          const copy = { ...(listing.typeData as Record<string, unknown>) };
          delete copy.phone;
          delete copy.email;
          delete copy.website;
          delete copy.whatsapp;
          delete copy.googleMapsUrl;
          return copy;
        })()
      : listing.typeData;

  return {
    listing: {
      ...listing,
      typeData: sanitizedTypeData,
      images,
      bookingEligible: eligibility.eligible === true,
      bookingEligibilityReason: eligibility.reason,
      isInstantBook: eligibility.eligible === true && listing.isInstantBook === true,
    },
    similar: similarWithImages,
  };
}
