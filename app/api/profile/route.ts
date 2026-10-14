import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, bookings, reviews } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireUser } from "@/server/admin-auth";

import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const userId = auth.userId;
    const expectedUserId = new URL(request.url).searchParams.get("expectedUserId");
    if (expectedUserId && expectedUserId !== userId) return NextResponse.json({ error: "Your account changed. Reload your profile." }, { status: 409 });

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Fetch user data
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        role: users.role,
        businessName: users.businessName,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch counts in parallel
    const [bookingCount, reviewCount, savedCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookings)
        .where(eq(bookings.travelerId, userId))
        .then((r) => r[0].count),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(eq(reviews.travelerId, userId))
        .then((r) => r[0].count),
      db
        .select({ count: sql<number>`(SELECT count(*)::int FROM (
          SELECT s.listing_id FROM saved_listings s JOIN listings l ON l.id=s.listing_id AND l.status='active' WHERE s.user_id=${userId}::uuid
          UNION SELECT wi.listing_id FROM wishlist_items wi JOIN wishlist_collections wc ON wc.id=wi.collection_id JOIN listings l ON l.id=wi.listing_id AND l.status='active' WHERE wc.user_id=${userId}::uuid
        ) own_saved)` })
        .from(users)
        .where(eq(users.id, userId))
        .then((r) => r[0].count),
    ]);

    return NextResponse.json({
      user,
      stats: {
        bookings: bookingCount,
        reviews: reviewCount,
        saved: savedCount,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logger.error("GET /api/profile error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const userId = auth.userId;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid profile update" }, { status: 400 });
    if (body.expectedUserId !== userId) return NextResponse.json({ error: "Your account changed. Reload your profile before saving." }, { status: 409 });
    const { name, phone } = body as { name?: string; phone?: string };

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (typeof name === "string") updates.name = name.trim() || null;
    if (typeof phone === "string") updates.phone = phone.trim() || null;

    if (Object.keys(updates).length === 1) {
      // Only updatedAt, nothing to change
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(and(eq(users.id, userId), eq(users.sessionVersion, auth.sessionVersion), sql`${users.role}=${auth.role}`))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        role: users.role,
        businessName: users.businessName,
        createdAt: users.createdAt,
      });

    if (!updated) {
      return NextResponse.json({ error: "Your account changed. Reload your profile before saving." }, { status: 409 });
    }

    return NextResponse.json({ user: updated }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logger.error("PATCH /api/profile error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
