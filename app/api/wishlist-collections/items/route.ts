import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  wishlistCollections,
  wishlistItems,
  listings,
} from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — List items in a wishlist collection
 * Query: ?collectionId=xxx
 */
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get("collectionId");

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Verify collection belongs to user
    const [collection] = await db
      .select()
      .from(wishlistCollections)
      .where(
        and(
          eq(wishlistCollections.id, collectionId),
          eq(wishlistCollections.userId, userId)
        )
      )
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    const items = await db
      .select({
        listingId: wishlistItems.listingId,
        addedAt: wishlistItems.createdAt,
        listingTitle: listings.title,
        listingSlug: listings.slug,
        listingType: listings.type,
        priceAmount: listings.priceAmount,
        priceCurrency: listings.priceCurrency,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
      })
      .from(wishlistItems)
      .innerJoin(listings, eq(wishlistItems.listingId, listings.id))
      .where(eq(wishlistItems.collectionId, collectionId));

    return NextResponse.json({ items });
  } catch (error) {
    logger.error("Wishlist items GET error", error);
    return NextResponse.json(
      { error: "Failed to fetch items" },
      { status: 500 }
    );
  }
}

/**
 * POST — Add an item to a wishlist collection
 * Body: { collectionId, listingId }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { collectionId, listingId } = await request.json();

    if (!collectionId || !listingId) {
      return NextResponse.json(
        { error: "collectionId and listingId required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Verify collection belongs to user
    const [collection] = await db
      .select()
      .from(wishlistCollections)
      .where(
        and(
          eq(wishlistCollections.id, collectionId),
          eq(wishlistCollections.userId, userId)
        )
      )
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    await db
      .insert(wishlistItems)
      .values({ collectionId, listingId })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    logger.error("Wishlist items POST error", error);
    return NextResponse.json(
      { error: "Failed to add item" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Remove an item from a wishlist collection
 * Query: ?collectionId=xxx&listingId=yyy
 */
export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get("collectionId");
    const listingId = searchParams.get("listingId");

    if (!collectionId || !listingId) {
      return NextResponse.json(
        { error: "collectionId and listingId required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Verify collection belongs to user
    const [collection] = await db
      .select()
      .from(wishlistCollections)
      .where(
        and(
          eq(wishlistCollections.id, collectionId),
          eq(wishlistCollections.userId, userId)
        )
      )
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    await db
      .delete(wishlistItems)
      .where(
        and(
          eq(wishlistItems.collectionId, collectionId),
          eq(wishlistItems.listingId, listingId)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Wishlist items DELETE error", error);
    return NextResponse.json(
      { error: "Failed to remove item" },
      { status: 500 }
    );
  }
}
