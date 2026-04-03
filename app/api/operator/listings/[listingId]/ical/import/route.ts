import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, availability } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { parseICal } from "@/lib/ical-parser";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

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

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    }

    const { payload } = await jwtVerify(sessionToken, SECRET);
    const userId = payload.id as string;
    const role = payload.role as string;

    if (role !== "operator" && role !== "admin") {
      return NextResponse.json(
        { error: "Only operators can manage iCal sync" },
        { status: 403 }
      );
    }

    const db = getDb();

    // Verify ownership
    const [listing] = await db
      .select({
        id: listings.id,
        operatorId: listings.operatorId,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.operatorId !== userId && role !== "admin") {
      return NextResponse.json(
        { error: "You do not own this listing" },
        { status: 403 }
      );
    }

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

    // Fetch the iCal feed
    const icalRes = await fetch(url, {
      headers: { "User-Agent": "VakayGo/1.0 Calendar Sync" },
      signal: AbortSignal.timeout(15000),
    });

    if (!icalRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch iCal feed: HTTP ${icalRes.status}` },
        { status: 422 }
      );
    }

    const icalText = await icalRes.text();

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
    console.error("iCal import error:", error);
    return NextResponse.json(
      { error: "Failed to import iCal feed" },
      { status: 500 }
    );
  }
}
