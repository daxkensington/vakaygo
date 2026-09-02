import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, listingClaims, users, islands } from "@/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireOperator } from "@/server/admin-auth";
import { createNotification } from "@/server/notifications";
import { sendClaimReceived, sendClaimToTeam } from "@/server/email-requests";
import { isUnclaimedTypeData } from "@/lib/booking-request";
import { logger } from "@/lib/logger";

/**
 * Listing claims.
 *
 * Before 2026-09-02 a POST here transferred ownership of any unclaimed
 * listing to whoever asked, with no verification — and no UI ever called
 * it, so nobody could claim at all. Now a claim is a REQUEST reviewed by an
 * admin (verified by phoning the number on the listing) via /api/admin/claims.
 */

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET ?listingId= — the listing summary + this operator's claim state, for the claim page. */
export async function GET(request: Request) {
  const auth = await requireOperator();
  if (!auth.ok) return auth.error;

  const listingId = new URL(request.url).searchParams.get("listingId") || "";
  if (!UUID.test(listingId)) {
    return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  }

  const db = getDb();
  const [listing] = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      type: listings.type,
      address: listings.address,
      typeData: listings.typeData,
      islandName: islands.name,
      islandSlug: islands.slug,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const [claim] = await db
    .select({
      id: listingClaims.id,
      status: listingClaims.status,
      createdAt: listingClaims.createdAt,
      adminNotes: listingClaims.adminNotes,
    })
    .from(listingClaims)
    .where(and(eq(listingClaims.listingId, listingId), eq(listingClaims.operatorId, auth.userId)))
    .orderBy(desc(listingClaims.createdAt))
    .limit(1);

  const td = (listing.typeData || {}) as Record<string, unknown>;
  const phone = typeof td.phone === "string" ? td.phone : null;

  return NextResponse.json({
    listing: {
      id: listing.id,
      title: listing.title,
      type: listing.type,
      address: listing.address,
      islandName: listing.islandName,
      url: `/${listing.islandSlug}/${listing.slug}`,
      unclaimed: isUnclaimedTypeData(listing.typeData),
      // Masked: the claimant must already know the number; we only hint.
      phoneHint: phone ? phone.replace(/\d(?=\d{2})/g, "•") : null,
    },
    claim: claim || null,
  });
}

export async function POST(request: Request) {
  try {
    const auth = await requireOperator();
    if (!auth.ok) return auth.error;

    const body = await request.json().catch(() => ({}));
    const listingId = typeof body.listingId === "string" ? body.listingId : "";
    const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
    const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() : "";
    const roleAtBusiness =
      typeof body.roleAtBusiness === "string" ? body.roleAtBusiness.trim().slice(0, 128) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

    if (!UUID.test(listingId)) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    if (contactName.length < 2 || contactName.length > 256) {
      return NextResponse.json({ error: "Please tell us your name" }, { status: 400 });
    }
    if (contactPhone.replace(/\D/g, "").length < 7 || contactPhone.length > 40) {
      return NextResponse.json({ error: "Please give a phone number we can call" }, { status: 400 });
    }

    const db = getDb();

    const [listing] = await db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        typeData: listings.typeData,
        operatorId: listings.operatorId,
        islandName: islands.name,
        islandSlug: islands.slug,
      })
      .from(listings)
      .innerJoin(islands, eq(listings.islandId, islands.id))
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (!isUnclaimedTypeData(listing.typeData)) {
      return NextResponse.json(
        { error: "This listing has already been claimed" },
        { status: 409 }
      );
    }

    const [existing] = await db
      .select({ id: listingClaims.id, status: listingClaims.status })
      .from(listingClaims)
      .where(
        and(
          eq(listingClaims.listingId, listingId),
          eq(listingClaims.operatorId, auth.userId),
          eq(listingClaims.status, "pending")
        )
      )
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "You already have a claim under review for this listing", claimId: existing.id },
        { status: 409 }
      );
    }

    const [claim] = await db
      .insert(listingClaims)
      .values({
        listingId,
        operatorId: auth.userId,
        contactName,
        contactPhone,
        roleAtBusiness: roleAtBusiness || null,
        notes: notes || null,
      })
      .returning({ id: listingClaims.id, status: listingClaims.status, createdAt: listingClaims.createdAt });

    const [claimant] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    const td = (listing.typeData || {}) as Record<string, unknown>;
    const listingPhone = typeof td.phone === "string" && td.phone.trim() ? td.phone.trim() : null;

    sendClaimToTeam({
      claimId: claim.id,
      listingTitle: listing.title,
      listingUrl: `https://vakaygo.com/${listing.islandSlug}/${listing.slug}`,
      islandName: listing.islandName,
      listingPhone,
      contactName,
      contactPhone,
      contactEmail: claimant?.email || "",
      roleAtBusiness: roleAtBusiness || null,
      notes: notes || null,
    }).catch((err) => logger.error("Claim email (team) failed", err));

    if (claimant?.email) {
      sendClaimReceived({
        to: claimant.email,
        contactName,
        listingTitle: listing.title,
      }).catch((err) => logger.error("Claim email (claimant) failed", err));
    }

    // In-app for every admin (the team inbox email is the primary alert).
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    for (const admin of admins) {
      createNotification({
        userId: admin.id,
        type: "system",
        title: `Listing claim: ${listing.title}`,
        body: `${contactName} · ${contactPhone}`,
        link: "/admin/claims",
      }).catch(() => {});
    }

    return NextResponse.json({ claim }, { status: 201 });
  } catch (error) {
    logger.error("Claim listing error", error);
    return NextResponse.json({ error: "Failed to submit claim" }, { status: 500 });
  }
}
