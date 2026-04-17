import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { trips, tripItems, listings, islands, media } from "@/drizzle/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { getImageUrl } from "@/lib/image-utils";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.id as string;
  } catch {
    return null;
  }
}

// ─── GET: Fetch trip with items and listing details ────────────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();

    // Get trip
    const [trip] = await db
      .select({
        id: trips.id,
        userId: trips.userId,
        islandId: trips.islandId,
        islandName: islands.name,
        islandSlug: islands.slug,
        title: trips.title,
        startDate: trips.startDate,
        endDate: trips.endDate,
        guestCount: trips.guestCount,
        budget: trips.budget,
        interests: trips.interests,
        isAiGenerated: trips.isAiGenerated,
        isPublic: trips.isPublic,
        createdAt: trips.createdAt,
      })
      .from(trips)
      .leftJoin(islands, eq(trips.islandId, islands.id))
      .where(eq(trips.id, id))
      .limit(1);

    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Only owner or public trips
    if (trip.userId !== userId && !trip.isPublic) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get items
    const items = await db
      .select()
      .from(tripItems)
      .where(eq(tripItems.tripId, id))
      .orderBy(asc(tripItems.dayNumber), asc(tripItems.sortOrder));

    // Get listing details for items with listingIds
    const listingIds = items
      .map((i) => i.listingId)
      .filter((id): id is string => id !== null);

    const listingMap = new Map<string, Record<string, unknown>>();
    const imageMap = new Map<string, string>();

    if (listingIds.length > 0) {
      const listingRows = await db
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
          islandSlug: islands.slug,
          islandName: islands.name,
        })
        .from(listings)
        .innerJoin(islands, eq(listings.islandId, islands.id))
        .where(inArray(listings.id, listingIds));

      for (const l of listingRows) {
        listingMap.set(l.id, l);
      }

      const images = await db
        .select({ listingId: media.listingId, url: media.url })
        .from(media)
        .where(and(inArray(media.listingId, listingIds), eq(media.isPrimary, true)));

      for (const img of images) {
        imageMap.set(img.listingId, getImageUrl(img.url) || img.url);
      }
    }

    const itemsWithListings = items.map((item) => ({
      ...item,
      listing: item.listingId
        ? {
            ...listingMap.get(item.listingId),
            image: imageMap.get(item.listingId) || null,
          }
        : null,
    }));

    return NextResponse.json({ trip, items: itemsWithListings });
  } catch (error) {
    logger.error("Trip GET error", error);
    return NextResponse.json({ error: "Failed to fetch trip" }, { status: 500 });
  }
}

// ─── PATCH: Update trip ────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    // Verify ownership
    const [existing] = await db
      .select({ userId: trips.userId })
      .from(trips)
      .where(eq(trips.id, id))
      .limit(1);

    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.startDate !== undefined) updates.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) updates.endDate = new Date(body.endDate);
    if (body.isPublic !== undefined) updates.isPublic = body.isPublic;

    const [updated] = await db
      .update(trips)
      .set(updates)
      .where(eq(trips.id, id))
      .returning();

    return NextResponse.json({ trip: updated });
  } catch (error) {
    logger.error("Trip PATCH error", error);
    return NextResponse.json({ error: "Failed to update trip" }, { status: 500 });
  }
}

// ─── DELETE: Delete trip ───────────────────────────────────────
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();

    // Verify ownership
    const [existing] = await db
      .select({ userId: trips.userId })
      .from(trips)
      .where(eq(trips.id, id))
      .limit(1);

    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });
    }

    // Delete trip (cascade deletes items via FK)
    await db.delete(trips).where(eq(trips.id, id));

    return NextResponse.json({ deleted: true });
  } catch (error) {
    logger.error("Trip DELETE error", error);
    return NextResponse.json({ error: "Failed to delete trip" }, { status: 500 });
  }
}
