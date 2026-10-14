import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, islands } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { requireOperator } from "@/server/admin-auth";

import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const auth = await requireOperator();
    if (!auth.ok) return auth.error;
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const results = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        type: listings.type,
        status: listings.status,
        priceAmount: listings.priceAmount,
        priceUnit: listings.priceUnit,
        avgRating: listings.avgRating,
        reviewCount: listings.reviewCount,
        islandName: islands.name,
        islandSlug: islands.slug,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(eq(listings.operatorId, auth.userId))
      .orderBy(listings.createdAt);

    return NextResponse.json({ listings: results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logger.error("My listings error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
