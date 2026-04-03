import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, users, islands } from "@/drizzle/schema";
import { eq, sql, desc, and, ilike } from "drizzle-orm";
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

    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const island = searchParams.get("island");
    const q = searchParams.get("q");

    // Build conditions
    const conditions = [];
    if (status) conditions.push(eq(listings.status, status as any));
    if (type) conditions.push(eq(listings.type, type as any));
    if (island) conditions.push(eq(islands.slug, island));
    if (q) conditions.push(ilike(listings.title, `%${q}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(whereClause);

    const total = totalResult.count;

    // Fetch listings with operator and island info
    const results = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        status: listings.status,
        priceAmount: listings.priceAmount,
        priceCurrency: listings.priceCurrency,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        isFeatured: listings.isFeatured,
        createdAt: listings.createdAt,
        updatedAt: listings.updatedAt,
        operatorId: listings.operatorId,
        operatorName: users.name,
        operatorEmail: users.email,
        islandId: listings.islandId,
        islandName: islands.name,
        islandSlug: islands.slug,
      })
      .from(listings)
      .innerJoin(users, eq(listings.operatorId, users.id))
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(whereClause)
      .orderBy(desc(listings.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      listings: results,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin listings error:", error);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}
