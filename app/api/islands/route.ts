import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings } from "@/drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";

import { logger } from "@/lib/logger";
export async function GET() {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const results = await db
      .select({
        id: islands.id,
        slug: islands.slug,
        name: islands.name,
        country: islands.country,
        listingCount: sql<number>`count(${listings.id})::int`,
      })
      .from(islands)
      .leftJoin(listings, eq(islands.id, listings.islandId))
      .where(eq(islands.isActive, true))
      .groupBy(islands.id)
      .orderBy(desc(sql`count(${listings.id})`));

    return NextResponse.json({ islands: results });
  } catch (error) {
    logger.error("Islands error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
