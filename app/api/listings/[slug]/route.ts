import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands, users } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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
        createdAt: listings.createdAt,
        islandSlug: islands.slug,
        islandName: islands.name,
        operatorName: users.businessName,
        operatorAvatar: users.avatarUrl,
        operatorId: users.id,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .innerJoin(users, eq(listings.operatorId, users.id))
      .where(and(eq(listings.slug, slug), eq(listings.status, "active")))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const rawImages = await db
      .select({
        id: media.id,
        url: media.url,
        alt: media.alt,
        isPrimary: media.isPrimary,
        sortOrder: media.sortOrder,
      })
      .from(media)
      .where(eq(media.listingId, listing.id))
      .orderBy(media.sortOrder);

    const images = rawImages.map((img) => ({
      ...img,
      url: getImageUrl(img.url) || img.url,
    }));

    // Get similar listings (same type, same island)
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
          eq(listings.islandId, islands.id)
        )
      )
      .limit(4);

    // Get primary images for similar listings
    const similarWithImages = await Promise.all(
      similar
        .filter((s) => s.id !== listing.id)
        .slice(0, 3)
        .map(async (s) => {
          const [img] = await db
            .select({ url: media.url })
            .from(media)
            .where(and(eq(media.listingId, s.id), eq(media.isPrimary, true)))
            .limit(1);
          return { ...s, image: getImageUrl(img?.url) || null };
        })
    );

    return NextResponse.json({
      listing: { ...listing, images },
      similar: similarWithImages,
    });
  } catch (error) {
    console.error("Listing detail error:", error);
    return NextResponse.json({ error: "Failed to fetch listing" }, { status: 500 });
  }
}
