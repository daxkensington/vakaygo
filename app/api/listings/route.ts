import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, islands, media, availability } from "@/drizzle/schema";
import { eq, and, ilike, desc, asc, gte, lte, inArray, notInArray, sql } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";

import { logger } from "@/lib/logger";
function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const island = searchParams.get("island");
    const search = searchParams.get("q");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const minRating = searchParams.get("minRating");
    const date = searchParams.get("date");
    const guests = searchParams.get("guests");
    const amenities = searchParams.get("amenities");
    const duration = searchParams.get("duration");
    const sort = searchParams.get("sort") || "recommended";
    const rawLimit = parseInt(searchParams.get("limit") || "24");
    const maxLimit = searchParams.get("limit") && rawLimit > 100 ? 2000 : 100;
    const limit = Math.min(maxLimit, Math.max(1, rawLimit));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0"));

    const db = getDb();
    const conditions = [eq(listings.status, "active")];

    // Date-based availability filtering
    if (date) {
      const unavailable = await db
        .select({ listingId: availability.listingId })
        .from(availability)
        .where(
          and(
            eq(availability.date, new Date(date)),
            sql`(${availability.isBlocked} = true OR ${availability.spotsRemaining} = 0)`
          )
        );

      const unavailableIds = unavailable.map((r) => r.listingId);
      if (unavailableIds.length > 0) {
        conditions.push(notInArray(listings.id, unavailableIds));
      }
    }

    if (type && type !== "all") {
      conditions.push(
        eq(
          listings.type,
          type as "stay" | "tour" | "dining" | "event" | "transport" | "guide"
        )
      );
    }
    if (island) {
      const [islandRow] = await db
        .select({ id: islands.id })
        .from(islands)
        .where(eq(islands.slug, island))
        .limit(1);
      if (islandRow) conditions.push(eq(listings.islandId, islandRow.id));
    }
    if (search) {
      conditions.push(ilike(listings.title, `%${search}%`));
    }
    if (minPrice) {
      conditions.push(gte(listings.priceAmount, minPrice));
    }
    if (maxPrice) {
      conditions.push(lte(listings.priceAmount, maxPrice));
    }
    if (minRating) {
      conditions.push(gte(listings.avgRating, minRating));
    }

    // Guest count filter — checks typeData JSON for capacity fields
    if (guests) {
      const guestCount = parseInt(guests);
      if (!isNaN(guestCount) && guestCount > 0) {
        conditions.push(
          sql`(
            (${listings.type} = 'stay' AND (${listings.typeData}->>'maxGuests')::int >= ${guestCount})
            OR (${listings.type} IN ('tour', 'excursion') AND (
              ${listings.typeData}->>'groupSize' IS NULL
              OR (${listings.typeData}->>'groupSize')::int >= ${guestCount}
            ))
            OR (${listings.type} = 'dining' AND (
              ${listings.typeData}->>'partySize' IS NULL
              OR (${listings.typeData}->>'partySize')::int >= ${guestCount}
            ))
            OR (${listings.type} NOT IN ('stay', 'tour', 'excursion', 'dining'))
          )`
        );
      }
    }

    // Amenity filter — checks typeData.amenities array contains all selected amenities
    if (amenities) {
      const amenityList = amenities.split(",").filter(Boolean);
      for (const amenity of amenityList) {
        conditions.push(
          sql`${listings.typeData}->'amenities' @> ${JSON.stringify([amenity])}::jsonb`
        );
      }
    }

    // Duration filter — checks typeData.duration for time ranges
    if (duration) {
      switch (duration) {
        case "under-2":
          conditions.push(
            sql`(${listings.typeData}->>'durationMinutes')::int < 120`
          );
          break;
        case "2-4":
          conditions.push(
            sql`(${listings.typeData}->>'durationMinutes')::int >= 120 AND (${listings.typeData}->>'durationMinutes')::int <= 240`
          );
          break;
        case "4-8":
          conditions.push(
            sql`(${listings.typeData}->>'durationMinutes')::int > 240 AND (${listings.typeData}->>'durationMinutes')::int <= 480`
          );
          break;
        case "full-day":
          conditions.push(
            sql`(${listings.typeData}->>'durationMinutes')::int > 480 AND (${listings.typeData}->>'isMultiDay')::boolean IS NOT TRUE`
          );
          break;
        case "multi-day":
          conditions.push(
            sql`(${listings.typeData}->>'isMultiDay')::boolean = true`
          );
          break;
      }
    }

    const orderBy =
      sort === "price-asc"
        ? asc(listings.priceAmount)
        : sort === "price-desc"
          ? desc(listings.priceAmount)
          : sort === "rating"
            ? desc(listings.avgRating)
            : sort === "newest"
              ? desc(listings.createdAt)
              : sort === "most-reviews"
                ? desc(listings.reviewCount)
                : desc(listings.isFeatured);

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
        islandSlug: islands.slug,
        islandName: islands.name,
        latitude: listings.latitude,
        longitude: listings.longitude,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Get primary images in a single query
    const listingIds = results.map((r) => r.id);
    const imageMap = new Map<string, string>();

    if (listingIds.length > 0) {
      // First try primary images
      const primaryImages = await db
        .select({ listingId: media.listingId, url: media.url })
        .from(media)
        .where(and(
          inArray(media.listingId, listingIds),
          eq(media.isPrimary, true)
        ));
      primaryImages.forEach((img) => imageMap.set(img.listingId, img.url));

      // For listings without a primary image, grab the first available media
      const missingIds = listingIds.filter((id) => !imageMap.has(id));
      if (missingIds.length > 0) {
        const fallbackImages = await db
          .select({ listingId: media.listingId, url: media.url })
          .from(media)
          .where(inArray(media.listingId, missingIds))
          .orderBy(media.sortOrder)
          .limit(missingIds.length);
        fallbackImages.forEach((img) => {
          if (!imageMap.has(img.listingId)) {
            imageMap.set(img.listingId, img.url);
          }
        });
      }
    }

    const data = results.map((r) => ({
      ...r,
      image: getImageUrl(imageMap.get(r.id)) || null,
    }));

    return NextResponse.json({ listings: data });
  } catch (error) {
    logger.error("Listings error", error);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      operatorId,
      islandId,
      type,
      title,
      description,
      address,
      parish,
      priceAmount,
      priceCurrency,
      priceUnit,
      typeData,
      latitude,
      longitude,
      cancellationPolicy,
      minStay,
      maxStay,
      advanceNotice,
      maxGuests,
    } = body;

    if (!operatorId || !title || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const db = getDb();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const [listing] = await db
      .insert(listings)
      .values({
        operatorId,
        islandId: islandId || 1,
        type,
        status: "pending_review",
        title,
        slug,
        description,
        address,
        parish,
        priceAmount: priceAmount?.toString(),
        priceCurrency: priceCurrency || "USD",
        priceUnit,
        typeData,
        latitude,
        longitude,
        cancellationPolicy: cancellationPolicy || "moderate",
        minStay: minStay || null,
        maxStay: maxStay || null,
        advanceNotice: advanceNotice || null,
        maxGuests: maxGuests || null,
      })
      .returning({ id: listings.id, slug: listings.slug });

    return NextResponse.json({ listing });
  } catch (error) {
    logger.error("Create listing error", error);
    return NextResponse.json(
      { error: "Failed to create listing" },
      { status: 500 }
    );
  }
}
