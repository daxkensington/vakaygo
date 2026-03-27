import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands } from "@/drizzle/schema";
import { eq, and, ilike, desc, asc, gte, lte, sql } from "drizzle-orm";

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
    const sort = searchParams.get("sort") || "recommended";
    const limit = parseInt(searchParams.get("limit") || "24");
    const offset = parseInt(searchParams.get("offset") || "0");

    const db = getDb();
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

    const orderBy =
      sort === "price-asc" ? asc(listings.priceAmount) :
      sort === "price-desc" ? desc(listings.priceAmount) :
      sort === "rating" ? desc(listings.avgRating) :
      sort === "newest" ? desc(listings.createdAt) :
      desc(listings.isFeatured);

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
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Get primary images for each listing
    const listingIds = results.map((r) => r.id);
    let images: { listingId: string; url: string }[] = [];
    if (listingIds.length > 0) {
      images = await db
        .select({ listingId: media.listingId, url: media.url })
        .from(media)
        .where(and(eq(media.isPrimary, true), sql`${media.listingId} = ANY(${listingIds})`));
    }

    const imageMap = new Map(images.map((i) => [i.listingId, i.url]));

    const data = results.map((r) => ({
      ...r,
      image: imageMap.get(r.id) || null,
    }));

    return NextResponse.json({ listings: data });
  } catch (error) {
    console.error("Listings error:", error);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
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
    } = body;

    if (!operatorId || !title || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
      })
      .returning({ id: listings.id, slug: listings.slug });

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Create listing error:", error);
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 });
  }
}
