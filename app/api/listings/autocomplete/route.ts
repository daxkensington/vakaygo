import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, islands } from "@/drizzle/schema";
import { eq, and, ilike, or } from "drizzle-orm";

import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ listings: [], islands: [] });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));
    const pattern = `%${q}%`;

    const [listingResults, islandResults] = await Promise.all([
      db
        .select({
          title: listings.title,
          slug: listings.slug,
          island: islands.name,
          islandSlug: islands.slug,
          type: listings.type,
        })
        .from(listings)
        .innerJoin(islands, eq(listings.islandId, islands.id))
        .where(
          and(
            eq(listings.status, "active"),
            or(
              ilike(listings.title, pattern),
              ilike(listings.headline, pattern)
            )
          )
        )
        .limit(8),
      db
        .select({
          name: islands.name,
          slug: islands.slug,
        })
        .from(islands)
        .where(
          and(eq(islands.isActive, true), ilike(islands.name, pattern))
        )
        .limit(4),
    ]);

    return NextResponse.json({
      listings: listingResults.map((r) => ({
        title: r.title,
        slug: r.slug,
        island: r.island,
        islandSlug: r.islandSlug,
        type: r.type,
      })),
      islands: islandResults.map((r) => ({
        name: r.name,
        slug: r.slug,
      })),
    });
  } catch (error) {
    logger.error("Autocomplete error", error);
    return NextResponse.json({ listings: [], islands: [] });
  }
}
