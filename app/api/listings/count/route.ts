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

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(and(...conditions));

    return NextResponse.json({ count: result.count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
