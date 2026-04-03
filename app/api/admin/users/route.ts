import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, listings, bookings } from "@/drizzle/schema";
import { eq, sql, desc, and, or, ilike } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") return null;
    return payload.id as string;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const role = searchParams.get("role");
    const q = searchParams.get("q");

    // Build conditions
    const conditions = [];
    if (role) conditions.push(eq(users.role, role as any));
    if (q) {
      conditions.push(
        or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);

    const total = totalResult.count;

    // Fetch users with listing and booking counts via subqueries
    const results = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        role: users.role,
        businessName: users.businessName,
        emailVerified: users.emailVerified,
        onboardingComplete: users.onboardingComplete,
        isSuperhost: users.isSuperhost,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        listingCount: sql<number>`(
          SELECT count(*)::int FROM listings WHERE listings.operator_id = users.id
        )`,
        bookingCount: sql<number>`(
          SELECT count(*)::int FROM bookings
          WHERE bookings.traveler_id = users.id OR bookings.operator_id = users.id
        )`,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      users: results,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
