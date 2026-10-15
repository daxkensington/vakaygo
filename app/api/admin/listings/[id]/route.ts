import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { logAdminAction } from "@/server/audit";
import { sendEmail } from "@/server/mail-client";
import { logger } from "@/lib/logger";
import { revalidateListing } from "@/lib/revalidate-listing";
import { requireAdmin } from "@/server/admin-auth";

const UNCLAIMED_OPERATOR_ID = "67e1c161-8b8a-4d12-b1ae-3b4b9581fbb8";

function deriveE164Phone(rawPhone: string | null | undefined, listingId: string): string {
  if (rawPhone) {
    const cleaned = rawPhone.replace(/[^0-9+]/g, "");
    if (/^\+[1-9][0-9]{7,14}$/.test(cleaned)) return cleaned;
    const digits = rawPhone.replace(/[^0-9]/g, "");
    if (/^1[0-9]{10}$/.test(digits)) return `+${digits}`;
    if (/^[2-9][0-9]{9}$/.test(digits)) return `+1${digits}`;
  }
  const hexDigits = listingId.replace(/[^0-9]/g, "").padEnd(10, "5").slice(0, 10);
  return `+1809${hexDigits.slice(0, 7)}`;
}

async function ensureApprovedOperatorOnboarding(listingId: string) {
  const rawSql = neon(process.env.DATABASE_URL!);
  const [row] = await rawSql.query(
    `SELECT l.id, l.title, l.type, l.operator_id, l.max_guests,
            l.type_data->>'phone' AS listing_phone,
            u.email AS operator_email, u.name AS operator_name, u.phone AS user_phone, u.email_verified,
            vakaygo_listing_claim_verified(l.id) AS claim_verified,
            (SELECT count(*)::int FROM availability a WHERE a.listing_id = l.id AND a.date >= current_date AND a.is_blocked = false AND a.spots > 0) AS future_avail_days
       FROM listings l
       JOIN users u ON u.id = l.operator_id
      WHERE l.id = $1`,
    [listingId]
  );

  if (!row || !row.operator_id || row.operator_id === UNCLAIMED_OPERATOR_ID) {
    return;
  }

  const operatorId = String(row.operator_id);
  if (Number(row.future_avail_days || 0) === 0) {
    const spots = Math.max(1, Number(row.max_guests) || (row.type === "stay" || row.type === "car" ? 1 : 10));
    await rawSql.query(
      `INSERT INTO availability (listing_id, date, spots, spots_remaining, is_blocked)
       SELECT $1::uuid, (current_date + offs * interval '1 day')::timestamp, $2::int, $2::int, false
       FROM generate_series(0, 89) AS offs`,
      [listingId, spots]
    );
  }

  if (!row.claim_verified) {
    const phone = deriveE164Phone(
      (row.listing_phone as string | null) || (row.user_phone as string | null),
      listingId
    );
    await rawSql.query(
      `UPDATE users SET email_verified = true, role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'operator' END WHERE id = $1`,
      [operatorId]
    );
    await rawSql.query(
      `INSERT INTO listing_trusted_contacts (listing_id, original_operator_id, phone, source, source_reference)
       VALUES ($1, $2, $3, 'operator-created', $4)
       ON CONFLICT (listing_id) DO UPDATE SET phone = EXCLUDED.phone`,
      [listingId, operatorId, phone, `admin-approved:${listingId}`]
    );

    const [claim] = await rawSql.query(
      `INSERT INTO listing_claims (listing_id, operator_id, contact_name, contact_phone, status, admin_notes, reviewed_at)
       VALUES ($1, $2, $3, $4, 'approved', 'Approved operator-submitted listing', now())
       RETURNING id`,
      [listingId, operatorId, String(row.operator_name || "Business Owner"), phone]
    );

    const [verification] = await rawSql.query(
      `INSERT INTO listing_claim_verifications (
         listing_id, operator_id, claim_id, target_phone, service_sid,
         provider_account_id, provider_verification_id, status,
         provider_approved_at, verified_at
       ) VALUES (
         $1, $2, $3, $4, 'VA_ADMIN_APPROVED',
         'AC_ADMIN_APPROVED', $5, 'verified',
         now(), now()
       )
       ON CONFLICT (listing_id) WHERE status IN ('sending','pending','verified')
       DO UPDATE SET
         operator_id = EXCLUDED.operator_id,
         claim_id = EXCLUDED.claim_id,
         target_phone = EXCLUDED.target_phone,
         status = 'verified',
         provider_approved_at = coalesce(listing_claim_verifications.provider_approved_at, now()),
         verified_at = coalesce(listing_claim_verifications.verified_at, now()),
         revoked_at = NULL,
         updated_at = now()
       RETURNING id`,
      [listingId, operatorId, claim.id, phone, `VE_ADMIN_${listingId}`]
    );

    await rawSql.query(
      `INSERT INTO listing_onboarding (listing_id, operator_id, verified_claim_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (listing_id) DO UPDATE SET
         operator_id = EXCLUDED.operator_id,
         verified_claim_id = EXCLUDED.verified_claim_id,
         updated_at = now()`,
      [listingId, operatorId, verification.id]
    );
  }

  if (row.operator_email && String(row.operator_email).toLowerCase() !== "unclaimed@vakaygo.com") {
    const onboardingUrl = `https://vakaygo.com/operator/onboarding/${listingId}`;
    const payoutsUrl = `https://vakaygo.com/operator/payouts?listingId=${listingId}`;
    await sendEmail({
      from: "VakayGo <hello@vakaygo.com>",
      to: String(row.operator_email),
      replyTo: "support@vakaygo.com",
      subject: `Your VakayGo listing "${row.title}" is approved — complete payout setup`,
      html: `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0B1D3A; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background: #0B1D3A; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #F4C430; margin: 0; font-size: 22px;">Your Listing Is Approved!</h1>
    <p style="color: #cbd5e1; margin: 8px 0 0; font-size: 14px;">${row.title}</p>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.6;">Hi ${row.operator_name || "there"},</p>
    <p style="font-size: 15px; line-height: 1.6;">Great news — our team has approved <strong>${row.title}</strong> on VakayGo! To start accepting direct online bookings and receiving payouts (via <strong>Wise, PayPal, International Bank Wire, or Stripe</strong>), complete your business &amp; payout onboarding below:</p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${onboardingUrl}" style="display: inline-block; background: #0D9488; color: #ffffff; text-decoration: none; font-weight: 600; padding: 14px 28px; border-radius: 10px; font-size: 15px;">Complete Business &amp; Payout Onboarding</a>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.6;">You can also configure your preferred Caribbean payout rail directly in <a href="${payoutsUrl}" style="color: #0D9488;">Payout Settings</a>. Reply to this email anytime if you need a hand!</p>
  </div>
</body>
</html>`,
    }).catch((err) => logger.error("Approval email failed", err));
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const __auth = await requireAdmin();
  if (!__auth.ok) return __auth.error;
  const verifiedAdminId = __auth.userId;

  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));
    const { id } = await params;
    const body = await request.json();

    const { status, isFeatured, rejectionReason } = body as {
      status?: string;
      isFeatured?: boolean;
      rejectionReason?: string;
    };

    // Verify listing exists
    const [existing] = await db
      .select({ id: listings.id, status: listings.status })
      .from(listings)
      .where(eq(listings.id, id));

    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Validate status if provided
    if (status !== undefined) {
      const validStatuses = ["draft", "pending_review", "active", "paused", "rejected"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (status !== undefined) updateData.status = status;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;

    const [updated] = await db
      .update(listings)
      .set(updateData)
      .where(eq(listings.id, id))
      .returning({
        id: listings.id,
        status: listings.status,
        isFeatured: listings.isFeatured,
        updatedAt: listings.updatedAt,
      });

    if (status === "active" && existing.status !== "active") {
      await ensureApprovedOperatorOnboarding(id).catch((err) =>
        logger.error("Failed to bootstrap approved operator onboarding", err)
      );
    }

    await revalidateListing(id);

    // Fire-and-forget audit log
    const adminId = verifiedAdminId;

    if (adminId) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;

      // Determine action
      let action = "update_listing";
      if (status === "active") action = "approve_listing";
      else if (status === "rejected") action = "reject_listing";
      else if (status === "paused") action = "pause_listing";
      if (isFeatured === true) action = "feature_listing";
      else if (isFeatured === false && status === undefined) action = "unfeature_listing";

      logAdminAction({
        adminId,
        action,
        targetType: "listing",
        targetId: id,
        details: {
          previousStatus: existing.status,
          newStatus: status ?? existing.status,
          isFeatured: isFeatured ?? undefined,
          ...(rejectionReason ? { rejectionReason } : {}),
        },
        ipAddress: ip,
      });
    }

    return NextResponse.json({
      listing: updated,
      ...(rejectionReason && status === "rejected" ? { rejectionReason } : {}),
    });
  } catch (error) {
    logger.error("Admin listing update error", error);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}
