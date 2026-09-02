import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, listingClaims, users, islands } from "@/drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/admin-auth";
import { createNotification } from "@/server/notifications";
import { sendClaimDecision } from "@/server/email-requests";
import { logger } from "@/lib/logger";
import { revalidateListing } from "@/lib/revalidate-listing";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/** GET ?status=pending|approved|rejected|all — newest first. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;

  const status = new URL(request.url).searchParams.get("status") || "pending";
  const db = getDb();

  const where =
    status === "all"
      ? undefined
      : eq(listingClaims.status, status as "pending" | "approved" | "rejected");

  const rows = await db
    .select({
      id: listingClaims.id,
      status: listingClaims.status,
      contactName: listingClaims.contactName,
      contactPhone: listingClaims.contactPhone,
      roleAtBusiness: listingClaims.roleAtBusiness,
      notes: listingClaims.notes,
      adminNotes: listingClaims.adminNotes,
      createdAt: listingClaims.createdAt,
      reviewedAt: listingClaims.reviewedAt,
      listingId: listings.id,
      listingTitle: listings.title,
      listingSlug: listings.slug,
      listingType: listings.type,
      listingPhone: sql<string | null>`${listings.typeData}::jsonb->>'phone'`,
      listingWebsite: sql<string | null>`${listings.typeData}::jsonb->>'website'`,
      islandName: islands.name,
      islandSlug: islands.slug,
      claimantEmail: users.email,
      claimantName: users.name,
      claimantBusinessName: users.businessName,
    })
    .from(listingClaims)
    .innerJoin(listings, eq(listingClaims.listingId, listings.id))
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .innerJoin(users, eq(listingClaims.operatorId, users.id))
    .where(where)
    .orderBy(desc(listingClaims.createdAt))
    .limit(200);

  return NextResponse.json({ claims: rows });
}

/** PATCH { id, action: "approve" | "reject", adminNotes? } */
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    const action = body.action === "approve" || body.action === "reject" ? body.action : null;
    const adminNotes = typeof body.adminNotes === "string" ? body.adminNotes.trim().slice(0, 2000) : "";

    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const db = getDb();
    const [claim] = await db
      .select({
        id: listingClaims.id,
        status: listingClaims.status,
        listingId: listingClaims.listingId,
        operatorId: listingClaims.operatorId,
        contactName: listingClaims.contactName,
      })
      .from(listingClaims)
      .where(eq(listingClaims.id, id))
      .limit(1);

    if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    if (claim.status !== "pending") {
      return NextResponse.json({ error: `Claim already ${claim.status}` }, { status: 409 });
    }

    const [listing] = await db
      .select({ id: listings.id, title: listings.title, typeData: listings.typeData })
      .from(listings)
      .where(eq(listings.id, claim.listingId))
      .limit(1);
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const now = new Date();

    if (action === "approve") {
      const td = (listing.typeData || {}) as Record<string, unknown>;
      if (td.unclaimed !== true) {
        return NextResponse.json(
          { error: "Listing is no longer unclaimed — another claim was approved first" },
          { status: 409 }
        );
      }

      // Claim-then-transfer. The status flip is a compare-and-set so two
      // admins clicking approve on the same claim cannot both transfer.
      const [flipped] = await db
        .update(listingClaims)
        .set({ status: "approved", adminNotes: adminNotes || null, reviewedBy: auth.userId, reviewedAt: now, updatedAt: now })
        .where(and(eq(listingClaims.id, id), eq(listingClaims.status, "pending")))
        .returning({ id: listingClaims.id });
      if (!flipped) {
        return NextResponse.json({ error: "Claim was just reviewed by someone else" }, { status: 409 });
      }

      await db
        .update(listings)
        .set({
          operatorId: claim.operatorId,
          typeData: { ...td, unclaimed: false, claimedAt: now.toISOString(), claimId: id },
          updatedAt: now,
        })
        .where(eq(listings.id, listing.id));

      // The public page shows a "claim this business" banner keyed on
      // typeData.unclaimed — drop the cached copy now.
      await revalidateListing(listing.id);

      // Any other pending claims on this listing lose.
      await db
        .update(listingClaims)
        .set({
          status: "rejected",
          adminNotes: "Another claim for this listing was approved.",
          reviewedBy: auth.userId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(and(eq(listingClaims.listingId, listing.id), eq(listingClaims.status, "pending")));
    } else {
      const [flipped] = await db
        .update(listingClaims)
        .set({ status: "rejected", adminNotes: adminNotes || null, reviewedBy: auth.userId, reviewedAt: now, updatedAt: now })
        .where(and(eq(listingClaims.id, id), eq(listingClaims.status, "pending")))
        .returning({ id: listingClaims.id });
      if (!flipped) {
        return NextResponse.json({ error: "Claim was just reviewed by someone else" }, { status: 409 });
      }
    }

    const [claimant] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, claim.operatorId))
      .limit(1);
    if (claimant?.email) {
      sendClaimDecision({
        to: claimant.email,
        contactName: claim.contactName,
        listingTitle: listing.title,
        approved: action === "approve",
        adminNotes: adminNotes || null,
      }).catch((err) => logger.error("Claim decision email failed", err));
    }
    createNotification({
      userId: claim.operatorId,
      type: "system",
      title: action === "approve" ? `${listing.title} is now yours` : `Claim for ${listing.title} not approved`,
      body: adminNotes || undefined,
      link: action === "approve" ? "/operator/listings" : "/operator",
    }).catch(() => {});

    return NextResponse.json({ ok: true, status: action === "approve" ? "approved" : "rejected" });
  } catch (error) {
    logger.error("Review claim error", error);
    return NextResponse.json({ error: "Failed to review claim" }, { status: 500 });
  }
}
