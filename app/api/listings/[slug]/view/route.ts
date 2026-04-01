import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { cookies, headers } from "next/headers";
import { jwtVerify } from "jose";
import { listings, listingViews } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const source = body.source || "direct";

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
        const { payload } = await jwtVerify(token, SECRET);
        userId = payload.id as string;
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

    // Insert view
    await db.insert(listingViews).values({
      listingId: listing.id,
      viewerIp,
      userId,
      source,
    });

    return NextResponse.json({ tracked: true });
  } catch (error) {
    console.error("Track view error:", error);
    return NextResponse.json({ error: "Failed to track view" }, { status: 500 });
  }
}
