import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const { slug } = await params;
    const body = await request.json();

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Verify ownership
    const [listing] = await db
      .select({ id: listings.id, operatorId: listings.operatorId, status: listings.status })
      .from(listings)
      .where(eq(listings.slug, slug))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const role = payload.role as string;
    if (listing.operatorId !== payload.id && role !== "admin") {
      return NextResponse.json({ error: "Not your listing" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title) updateData.title = body.title;
    if (body.description) updateData.description = body.description;
    if (body.headline) updateData.headline = body.headline;
    if (body.address) updateData.address = body.address;
    if (body.parish) updateData.parish = body.parish;
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

    await db.update(listings).set(updateData).where(eq(listings.id, listing.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Update listing error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
