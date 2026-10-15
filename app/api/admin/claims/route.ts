import { assertListingId, onboardingErrorResponse } from "@/server/business-onboarding";
import { finalizeVerifiedClaimInDb } from "@/server/claim-email-verification";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, listingClaims, users, islands } from "@/drizzle/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/admin-auth";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/** GET ?status=pending|approved|rejected|all — newest first. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;

  const status = new URL(request.url).searchParams.get("status") || "pending";
  if (!["pending","approved","rejected","all"].includes(status)) return NextResponse.json({ error: "Invalid status" },{ status: 400 });
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

/** Admin review can approve or reject a pending claim. */
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;
  try {
    const body = await request.json().catch(() => ({}));
    assertListingId(body.id);
    const notes = typeof body.adminNotes === "string" ? body.adminNotes.trim().slice(0,2000) : "";
    const sqlClient = neon(process.env.DATABASE_URL!);

    if (body.action === "approve") {
      const claimRows = await sqlClient`
        SELECT id, listing_id, operator_id, status
        FROM listing_claims
        WHERE id = ${body.id}
        LIMIT 1
      `;
      const claim = claimRows[0];
      if (!claim || claim.status !== "pending") {
        return NextResponse.json({ error: "Claim is no longer pending" }, { status: 409 });
      }
      await finalizeVerifiedClaimInDb(
        claim.listing_id,
        claim.operator_id,
        notes || "Approved by admin review",
        "admin-approved"
      );
      await sqlClient`
        UPDATE listing_claims
        SET reviewed_by = ${auth.userId}, reviewed_at = now()
        WHERE id = ${body.id}
      `;
      return NextResponse.json({ ok: true, status: "approved" });
    }

    if (body.action !== "reject") return NextResponse.json({ error: "Unknown review action" },{ status: 400 });
    const rows = await sqlClient`SELECT vakaygo_reject_claim(${body.id},${auth.userId},${notes}) rejected`;
    if (!rows[0]?.rejected) return NextResponse.json({ error: "Claim is no longer pending" },{ status: 409 });
    return NextResponse.json({ ok: true,status: "rejected" });
  } catch (error) { return onboardingErrorResponse(error); }
}
