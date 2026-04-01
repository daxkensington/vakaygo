import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { users, bookings, reviews, savedListings } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

async function getAuthUserId(): Promise<string | null> {
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

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        .select({ count: sql<number>`count(*)::int` })
        .from(savedListings)
        .where(eq(savedListings.userId, userId))
        .then((r) => r[0].count),
    ]);

    return NextResponse.json({
      user,
      stats: {
        bookings: bookingCount,
        reviews: reviewCount,
        saved: savedCount,
      },
    });
  } catch (error) {
    console.error("GET /api/profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
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
      .where(eq(users.id, userId))
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
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("PATCH /api/profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
