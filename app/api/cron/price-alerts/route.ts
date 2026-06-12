import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { savedListings, listings, users, islands } from "@/drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { sendPriceDropAlert } from "@/server/email";

import { logger } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

// Alert when the price falls at least 5% below the last price the
// traveler saw. Anything smaller is noise.
const DROP_THRESHOLD = 0.95;

/**
 * GET — Cron: alert travelers when a saved listing's price drops.
 *
 * First time a saved listing is seen, its current price is recorded as
 * lastKnownPrice (no alert). On later runs, a current price ≤ 95% of
 * lastKnownPrice triggers one alert email; lastKnownPrice then tracks
 * the current price either way, so each alert measures from the most
 * recent price the traveler could have seen.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const rows = await db
      .select({
        userId: savedListings.userId,
        listingId: savedListings.listingId,
        lastKnownPrice: savedListings.lastKnownPrice,
        title: listings.title,
        slug: listings.slug,
        islandSlug: islands.slug,
        currentPrice: listings.priceAmount,
        currency: listings.priceCurrency,
        email: users.email,
        name: users.name,
      })
      .from(savedListings)
      .innerJoin(listings, eq(savedListings.listingId, listings.id))
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .innerJoin(users, eq(savedListings.userId, users.id))
      .where(
        and(isNotNull(listings.priceAmount), eq(listings.status, "active"))
      );

    let seeded = 0;
    let alerted = 0;
    let failed = 0;

    for (const row of rows) {
      const current = parseFloat(row.currentPrice || "0");
      if (!current) continue;

      const last = row.lastKnownPrice ? parseFloat(row.lastKnownPrice) : null;

      if (last === null) {
        seeded++;
      } else if (current <= last * DROP_THRESHOLD && row.email) {
        try {
          await sendPriceDropAlert({
            to: row.email,
            travelerName: row.name || "traveler",
            listingTitle: row.title,
            listingUrl: `https://vakaygo.com/${row.islandSlug}/${row.slug}`,
            oldPrice: last.toFixed(2),
            newPrice: current.toFixed(2),
          });
          alerted++;
        } catch (err) {
          failed++;
          logger.error("Price alert email failed", { listing: row.title, err });
          continue; // keep lastKnownPrice so the alert retries tomorrow
        }
      }

      if (last === null || current !== last) {
        await db
          .update(savedListings)
          .set({ lastKnownPrice: current.toFixed(2) })
          .where(
            and(
              eq(savedListings.userId, row.userId),
              eq(savedListings.listingId, row.listingId)
            )
          );
      }
    }

    return NextResponse.json({
      ok: true,
      checked: rows.length,
      seeded,
      alerted,
      failed,
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
