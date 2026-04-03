import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, islands } from "@/drizzle/schema";
import { eq, and, ilike, gte, lte, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const island = searchParams.get("island");
    const search = searchParams.get("q");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const minRating = searchParams.get("minRating");
    const guests = searchParams.get("guests");
    const amenities = searchParams.get("amenities");
    const duration = searchParams.get("duration");

    const db = drizzle(neon(process.env.DATABASE_URL!));
    const conditions = [eq(listings.status, "active")];

    if (type && type !== "all") {
      conditions.push(eq(listings.type, type as "stay" | "tour" | "dining" | "event" | "transport" | "guide"));
    }
    if (island) {
      const [islandRow] = await db.select({ id: islands.id }).from(islands).where(eq(islands.slug, island)).limit(1);
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

    // Guest count filter
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

    // Amenity filter
    if (amenities) {
      const amenityList = amenities.split(",").filter(Boolean);
      for (const amenity of amenityList) {
        conditions.push(
          sql`${listings.typeData}->'amenities' @> ${JSON.stringify([amenity])}::jsonb`
        );
      }
    }

    // Duration filter
    if (duration) {
      switch (duration) {
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
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(and(...conditions));

    return NextResponse.json({ count: result.count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
