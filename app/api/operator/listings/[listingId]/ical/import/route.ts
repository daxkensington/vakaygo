import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, availability } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { parseICal } from "@/lib/ical-parser";
import { safeFetchText } from "@/lib/safe-fetch";

import { logger } from "@/lib/logger";
import { requireOperator, assertListingOwnership } from "@/server/admin-auth";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * POST — Import an external iCal feed.
 * Fetches the .ics file, parses events, and creates blocked dates.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params;

    const auth = await requireOperator();
    if (!auth.ok) return auth.error;

    const owns = await assertListingOwnership(listingId, auth.userId, auth.role);
    if (!owns.ok) return owns.error;

    const db = getDb();

    const body = await request.json();
    const { url } = body as { url: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid iCal URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // SECURITY: operator-supplied URL fetched server-side — guard against SSRF
    // (internal hosts, cloud metadata, redirect-to-internal, oversized bodies).
    let icalText: string;
    try {
      icalText = await safeFetchText(url, {
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
      });
    } catch (fetchErr) {
      logger.warn("iCal import fetch blocked/failed", {
        listingId,
        error: fetchErr instanceof Error ? fetchErr.message : "unknown",
      });
      return NextResponse.json(
        { error: "Could not fetch the iCal feed from that URL" },
        { status: 422 }
      );
    }

    if (!icalText.includes("BEGIN:VCALENDAR")) {
      return NextResponse.json(
        { error: "The URL does not return a valid iCal feed" },
        { status: 422 }
      );
    }

    const events = parseICal(icalText);
    const now = new Date();
    const futureEvents = events.filter((e) => e.end > now);

    // Sync: create blocked dates for each event day
    let blockedCount = 0;
    for (const event of futureEvents) {
      // Iterate each day in the event range
      const current = new Date(event.start);
      while (current < event.end) {
        const dateObj = new Date(
          Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate())
        );

        // Check if availability record exists for this date
        const [existing] = await db
          .select({ id: availability.id, isBlocked: availability.isBlocked })
          .from(availability)
          .where(
            and(
              eq(availability.listingId, listingId),
              eq(availability.date, dateObj)
            )
          )
          .limit(1);

        if (existing) {
          // Update to blocked if not already
          if (!existing.isBlocked) {
            await db
              .update(availability)
              .set({ isBlocked: true })
              .where(eq(availability.id, existing.id));
            blockedCount++;
          }
        } else {
          // Insert new blocked date
          await db.insert(availability).values({
            listingId,
            date: dateObj,
            isBlocked: true,
          });
          blockedCount++;
        }

        // Move to next day
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }

    // Save the import URL and update last sync
    await db
      .update(listings)
      .set({
        icalImportUrl: url,
        icalLastSync: new Date(),
      })
      .where(eq(listings.id, listingId));

    return NextResponse.json({
      success: true,
      eventsFound: futureEvents.length,
      datesBlocked: blockedCount,
      lastSync: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("iCal import error", error);
    return NextResponse.json(
      { error: "Failed to import iCal feed" },
      { status: 500 }
    );
  }
}
