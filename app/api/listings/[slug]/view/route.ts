import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies, headers } from "next/headers";
import { verifyCurrentSessionToken } from "@/server/session-validation";
import { listings, listingViews } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  cleanCountry,
  cleanReferrerHost,
  cleanUtmSource,
  cleanViewSource,
  declaredBotUserAgent,
  networkBotReason,
  uaFamily,
} from "@/lib/view-attribution";
import { recordListingView } from "@/server/listing-view-attribution";

import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const ua = request.headers.get("user-agent") || "";
    if (declaredBotUserAgent(ua)) {
      return NextResponse.json({ tracked: false, reason: "bot" });
    }

    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const source = cleanViewSource(body?.source);
    const referrerHost = cleanReferrerHost(body?.referrerHost);
    const utmSource = cleanUtmSource(body?.utmSource);

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Find listing by slug
    const [listing] = await db
      .select({ id: listings.id })
      .from(listings)
      .where(eq(listings.slug, slug))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Get viewer IP
    const hdrs = await headers();
    const viewerIp =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "unknown";

    // Get userId from JWT cookie (optional)
    let userId: string | null = null;
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get("session")?.value;
      if (token) {
        const currentSession = await verifyCurrentSessionToken(token);
        userId = currentSession?.userId ?? null;
      }
    } catch {
      // anonymous view is fine
    }

    // Rate limit: max 1 view per IP per listing per hour
    const [existing] = await db
      .select({ id: listingViews.id })
      .from(listingViews)
      .where(
        and(
          eq(listingViews.listingId, listing.id),
          eq(listingViews.viewerIp, viewerIp),
          sql`${listingViews.createdAt} > now() - interval '1 hour'`
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ tracked: false, reason: "rate_limited" });
    }

    // A browser on a crawler or hosting network is kept for audit but
    // flagged, so trending and operator numbers count people only.
    const botReason = networkBotReason({ ip: viewerIp, asn: hdrs.get("x-vercel-ip-as-number") });

    await recordListingView(db, {
      listingId: listing.id,
      viewerIp,
      userId,
      source,
      uaFamily: uaFamily(ua),
      referrerHost,
      utmSource,
      country: cleanCountry(hdrs.get("x-vercel-ip-country")),
      botReason,
    });

    return NextResponse.json({ tracked: true });
  } catch (error) {
    logger.error("Track view error", error);
    return NextResponse.json({ error: "Failed to track view" }, { status: 500 });
  }
}
