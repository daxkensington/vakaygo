import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, availability } from "@/drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { parseICal } from "@/lib/ical-parser";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * GET — Cron job to re-sync all listings with iCal import URLs.
 * Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    // Find all listings with an import URL
    const listingsToSync = await db
      .select({
        id: listings.id,
        icalImportUrl: listings.icalImportUrl,
        title: listings.title,
      })
      .from(listings)
      .where(isNotNull(listings.icalImportUrl));

    const results: Array<{
      listingId: string;
      title: string;
      status: string;
      eventsFound?: number;
      datesBlocked?: number;
      error?: string;
    }> = [];

    for (const listing of listingsToSync) {
      if (!listing.icalImportUrl) continue;

      try {
        const icalRes = await fetch(listing.icalImportUrl, {
          headers: { "User-Agent": "VakayGo/1.0 Calendar Sync" },
          signal: AbortSignal.timeout(15000),
        });

        if (!icalRes.ok) {
          results.push({
            listingId: listing.id,
            title: listing.title,
            status: "error",
            error: `HTTP ${icalRes.status}`,
          });
          continue;
        }

        const icalText = await icalRes.text();

        if (!icalText.includes("BEGIN:VCALENDAR")) {
          results.push({
            listingId: listing.id,
            title: listing.title,
            status: "error",
            error: "Invalid iCal content",
          });
          continue;
        }

        const events = parseICal(icalText);
        const now = new Date();
        const futureEvents = events.filter((e) => e.end > now);

        let blockedCount = 0;
        for (const event of futureEvents) {
          const current = new Date(event.start);
          while (current < event.end) {
            const dateObj = new Date(
              Date.UTC(
                current.getUTCFullYear(),
                current.getUTCMonth(),
                current.getUTCDate()
              )
            );

            const [existing] = await db
              .select({ id: availability.id, isBlocked: availability.isBlocked })
              .from(availability)
              .where(
                and(
                  eq(availability.listingId, listing.id),
                  eq(availability.date, dateObj)
                )
              )
              .limit(1);

            if (existing) {
              if (!existing.isBlocked) {
                await db
                  .update(availability)
                  .set({ isBlocked: true })
                  .where(eq(availability.id, existing.id));
                blockedCount++;
              }
            } else {
              await db.insert(availability).values({
                listingId: listing.id,
                date: dateObj,
                isBlocked: true,
              });
              blockedCount++;
            }

            current.setUTCDate(current.getUTCDate() + 1);
          }
        }

        // Update last sync timestamp
        await db
          .update(listings)
          .set({ icalLastSync: new Date() })
          .where(eq(listings.id, listing.id));

        results.push({
          listingId: listing.id,
          title: listing.title,
          status: "success",
          eventsFound: futureEvents.length,
          datesBlocked: blockedCount,
        });
      } catch (err) {
        results.push({
          listingId: listing.id,
          title: listing.title,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      synced: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "error").length,
      total: listingsToSync.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("iCal cron sync error:", error);
    return NextResponse.json(
      { error: "Cron sync failed" },
      { status: 500 }
    );
  }
}
