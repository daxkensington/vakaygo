import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { requireOperator } from "@/server/admin-auth";
import { logger } from "@/lib/logger";
import { parseListingFilters } from "@/lib/listing-filters";
import { searchListings } from "@/server/listings-search";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // The map asks for up to 2,000 pins; everything else is capped at 100.
    const wantsBulk = parseInt(searchParams.get("limit") || "0", 10) > 100;
    const filters = parseListingFilters(searchParams, { maxLimit: wantsBulk ? 2000 : 100 });
    const data = await searchListings(filters);
    return NextResponse.json(
      { listings: data },
      // Public catalogue data, no cookies read: let the CDN serve repeats.
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
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
    const auth = await requireOperator();
    if (!auth.ok) return auth.error;

    const body = await request.json();
    const {
      operatorId: requestedOperatorId,
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

    // Operators can only create listings for themselves; admins may create
    // on behalf of any operator.
    const operatorId =
      auth.role === "admin" && requestedOperatorId
        ? requestedOperatorId
        : auth.userId;

    if (!title || !type) {
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
