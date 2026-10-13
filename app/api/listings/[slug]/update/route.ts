import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, users } from "@/drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireOperator } from "@/server/admin-auth";

import { logger } from "@/lib/logger";
import { revalidateListing } from "@/lib/revalidate-listing";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireOperator();
    if (!auth.ok) return auth.error;
    const { slug } = await params;
    const body = await request.json();

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Verify ownership
    const matches = await db
      .select({ id: listings.id, operatorId: listings.operatorId, status: listings.status })
      .from(listings)
      .where(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(slug) ? eq(listings.id, slug) : and(eq(listings.slug, slug), auth.role === "admin" ? undefined : eq(listings.operatorId, auth.userId)))
      .limit(2);
    if (matches.length > 1) return NextResponse.json({ error: "Open the exact listing from your dashboard before editing." }, { status: 409 });
    const listing = matches[0];

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const role = auth.role;
    if (listing.operatorId !== auth.userId && role !== "admin") {
      return NextResponse.json({ error: "Not your listing" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title) updateData.title = body.title;
    for (const field of ["description", "headline", "address", "parish"]) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        if (body[field] !== null && typeof body[field] !== "string") return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
        updateData[field] = body[field] || null;
      }
    }
    if (body.priceAmount !== undefined) updateData.priceAmount = body.priceAmount?.toString();
    if (body.priceUnit) updateData.priceUnit = body.priceUnit;
    if (body.typeData) updateData.typeData = body.typeData;
    if (body.status !== undefined) {
      // SECURITY: operators must NOT be able to self-publish past moderation.
      // Constrain the SOURCE state of every operator-initiated transition, not
      // just transitions into "active" — otherwise an operator could two-step
      // a draft live via draft→paused→active. "active"/"paused" (live states)
      // are only reachable from an already-approved (active/paused) listing;
      // unapproved listings may only move between draft/pending_review.
      const requested = body.status;
      if (role !== "admin") {
        // target status -> the source states an operator may transition FROM.
        // The live states (active/paused) require an already-approved source;
        // "rejected" is admin-only (absent here).
        const ALLOWED_SOURCES: Record<string, string[]> = {
          active: ["active", "paused"],
          paused: ["active", "paused"],
          draft: ["draft", "pending_review", "active", "paused", "rejected"],
          pending_review: ["draft", "pending_review", "active", "paused", "rejected"],
        };
        const allowedSources = ALLOWED_SOURCES[requested];
        if (!allowedSources || !allowedSources.includes(listing.status)) {
          return NextResponse.json(
            {
              error:
                "This listing must be approved by VakayGo before it can be published",
            },
            { status: 403 }
          );
        }
      }
      updateData.status = requested;
    }
    if (body.cancellationPolicy !== undefined) updateData.cancellationPolicy = body.cancellationPolicy;
    if (body.minStay !== undefined) updateData.minStay = body.minStay;
    if (body.maxStay !== undefined) updateData.maxStay = body.maxStay;
    if (body.advanceNotice !== undefined) updateData.advanceNotice = body.advanceNotice;
    if (body.maxGuests !== undefined) updateData.maxGuests = body.maxGuests;

    const [updated] = await db.update(listings).set(updateData).where(and(
      eq(listings.id, listing.id),
      role === "admin" ? undefined : eq(listings.operatorId, auth.userId),
      eq(listings.status, listing.status),
      // Recheck the authenticated proof at the write, including admin edits.
      sql<boolean>`exists (select 1 from ${users} where ${users.id}=${auth.userId}::uuid and ${users.sessionVersion}=${auth.sessionVersion} and ${users.role}=${role} and ${users.emailVerified}=true)`,
    )).returning({ id: listings.id });
    if (!updated) return NextResponse.json({ error: "This listing or account changed. Reload it before saving." }, { status: 409 });
    await revalidateListing(listing.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Update listing error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
