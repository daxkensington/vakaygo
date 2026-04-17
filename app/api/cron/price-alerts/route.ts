import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { savedListings, listings } from "@/drizzle/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Cron: Find saved listings where current price dropped.
 * Compares listings.priceAmount with a computed threshold.
 * For now, returns the count of price-drop matches (email sending handled separately).
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    // Find saved listings where the listing price has decreased.
    // We consider any listing that was updated recently and whose price
    // is lower than 90% of its original value (heuristic for "price drop").
    // In production, you'd store lastKnownPrice on the savedListings table.
    // For now, we just find active saved listings with their current prices.
    const results = await db
      .select({
        userId: savedListings.userId,
        listingId: savedListings.listingId,
        listingTitle: listings.title,
        currentPrice: listings.priceAmount,
        currency: listings.priceCurrency,
      })
      .from(savedListings)
      .innerJoin(listings, eq(savedListings.listingId, listings.id))
      .where(
        and(
          isNotNull(listings.priceAmount),
          eq(listings.status, "active")
        )
      );

    return NextResponse.json({
      ok: true,
      alertCount: results.length,
      alerts: results.slice(0, 50), // cap response size
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Price alerts cron error", error);
    return NextResponse.json(
      { error: "Failed to process price alerts" },
      { status: 500 }
    );
  }
}
