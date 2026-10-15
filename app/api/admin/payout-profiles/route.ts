import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/server/admin-auth";
import { expireListingPendingCheckouts } from "@/server/booking-checkout-safety";
import { revalidateListing } from "@/lib/revalidate-listing";
import { maskAccountNumber } from "@/server/payout-profiles";
import { logger } from "@/lib/logger";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const profiles = await sql.query(
      `SELECT p.id, p.listing_id, p.operator_id, p.payout_method, p.payout_currency,
              p.paypal_email, p.wise_recipient_email, p.wise_account_id,
              p.bank_name, p.bank_country, p.bank_account_holder, p.bank_account_number,
              p.bank_swift_bic, p.bank_routing_or_branch, p.intermediary_bank_swift,
              p.minimum_payout_usd, p.w8ben_certified, p.w8ben_beneficial_owner,
              p.w8ben_country, p.w8ben_tax_id, p.w8ben_signed_name, p.w8ben_signed_at,
              p.status, p.admin_notes, p.reviewed_at, p.revoked_at, p.updated_at,
              l.title AS listing_title, i.name AS island_name,
              u.email AS operator_email, u.name AS operator_name,
              n.business_legal_name, n.business_country
         FROM operator_payout_profiles p
         JOIN listings l ON l.id = p.listing_id
         JOIN islands i ON i.id = l.island_id
         JOIN users u ON u.id = p.operator_id
         LEFT JOIN listing_onboarding n ON n.listing_id = p.listing_id
        ORDER BY CASE WHEN p.status = 'pending_review' THEN 0 ELSE 1 END, p.updated_at DESC`
    );

    const pendingPayouts = await sql.query(
      `SELECT py.id, py.operator_id, py.amount, py.currency, py.status,
              py.period_start, py.period_end, py.booking_count, py.payment_reference,
              py.created_at, u.email AS operator_email, u.name AS operator_name,
              (SELECT p.payout_method FROM operator_payout_profiles p WHERE p.operator_id = py.operator_id AND p.status = 'verified' ORDER BY p.updated_at DESC LIMIT 1) AS payout_method,
              (SELECT coalesce(p.paypal_email, p.wise_recipient_email, p.bank_name || ' (' || coalesce(p.bank_swift_bic, '') || ')')
                 FROM operator_payout_profiles p WHERE p.operator_id = py.operator_id AND p.status = 'verified' ORDER BY p.updated_at DESC LIMIT 1) AS payout_destination
         FROM payouts py
         JOIN users u ON u.id = py.operator_id
        WHERE py.status IN ('pending', 'processing')
        ORDER BY py.created_at ASC`
    );

    return NextResponse.json({
      profiles: profiles.map((p) => ({
        id: p.id,
        listingId: p.listing_id,
        listingTitle: p.listing_title,
        islandName: p.island_name,
        operatorId: p.operator_id,
        operatorEmail: p.operator_email,
        operatorName: p.operator_name,
        businessLegalName: p.business_legal_name,
        businessCountry: p.business_country,
        payoutMethod: p.payout_method,
        payoutCurrency: p.payout_currency,
        paypalEmail: p.paypal_email,
        wiseRecipientEmail: p.wise_recipient_email,
        wiseAccountId: p.wise_account_id,
        bankName: p.bank_name,
        bankCountry: p.bank_country,
        bankAccountHolder: p.bank_account_holder,
        bankAccountNumberMasked: maskAccountNumber(p.bank_account_number as string | null),
        bankSwiftBic: p.bank_swift_bic,
        bankRoutingOrBranch: p.bank_routing_or_branch,
        intermediaryBankSwift: p.intermediary_bank_swift,
        minimumPayoutUsd: parseFloat((p.minimum_payout_usd as string) || "50"),
        w8benCertified: p.w8ben_certified === true,
        w8benBeneficialOwner: p.w8ben_beneficial_owner,
        w8benCountry: p.w8ben_country,
        w8benTaxId: p.w8ben_tax_id,
        w8benSignedName: p.w8ben_signed_name,
        w8benSignedAt: p.w8ben_signed_at,
        status: p.status,
        adminNotes: p.admin_notes,
        reviewedAt: p.reviewed_at,
        revokedAt: p.revoked_at,
        updatedAt: p.updated_at,
      })),
      pendingPayouts: pendingPayouts.map((py) => ({
        id: py.id,
        operatorId: py.operator_id,
        operatorEmail: py.operator_email,
        operatorName: py.operator_name,
        amount: parseFloat((py.amount as string) || "0"),
        currency: py.currency || "USD",
        status: py.status,
        bookingCount: Number(py.booking_count || 0),
        paymentReference: py.payment_reference,
        payoutMethod: py.payout_method,
        payoutDestination: py.payout_destination,
        createdAt: py.created_at,
      })),
    });
  } catch (error) {
    logger.error("Admin payout profiles GET error", error);
    return NextResponse.json({ error: "Failed to load payout profiles" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;
  try {
    const body = await request.json();
    const sql = neon(process.env.DATABASE_URL!);

    if (body?.action === "review_profile") {
      const profileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
      const decision = typeof body.decision === "string" ? body.decision.trim() : "";
      const adminNotes = typeof body.adminNotes === "string" ? body.adminNotes.trim().slice(0, 1000) : null;

      if (!profileId || !["verified", "rejected", "revoked"].includes(decision)) {
        return NextResponse.json({ error: "Valid profileId and decision (verified, rejected, revoked) required" }, { status: 400 });
      }

      const [updated] = await sql.query(
        `UPDATE operator_payout_profiles
            SET status = CASE WHEN $2 = 'revoked' THEN 'rejected' ELSE $2 END,
                revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE NULL END,
                reviewed_by = $3,
                reviewed_at = now(),
                admin_notes = $4,
                updated_at = now()
          WHERE id = $1
      RETURNING id, listing_id, operator_id, status`,
        [profileId, decision, auth.userId, adminNotes]
      );

      if (!updated) {
        return NextResponse.json({ error: "Payout profile not found" }, { status: 404 });
      }

      const listingId = updated.listing_id as string;
      if (decision !== "verified") {
        await sql.query(
          `UPDATE listing_onboarding SET activated_at = NULL, updated_at = now() WHERE listing_id = $1`,
          [listingId]
        );
        await expireListingPendingCheckouts(listingId);
      } else {
        await sql.query(
          `UPDATE listing_onboarding
              SET activated_at = coalesce(activated_at, now()),
                  updated_at = now()
            WHERE listing_id = $1
              AND suspended_at IS NULL
              AND authority_accepted_at IS NOT NULL
              AND terms_accepted_at IS NOT NULL
              AND length(trim(coalesce(business_legal_name, ''))) >= 2
              AND vakaygo_listing_claim_verified($1)
              AND vakaygo_listing_setup_valid($1)`,
          [listingId]
        );
      }
      await revalidateListing(listingId);

      await sql.query(
        `INSERT INTO audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, $2, 'payout_profile', $3, $4::json)`,
        [auth.userId, `payout_profile_${decision}`, profileId, JSON.stringify({ listingId, decision, adminNotes })]
      );

      if (decision === "verified") {
        const [opInfo] = await sql.query(
          `SELECT u.email, u.name, l.title, vakaygo_listing_bookable(l.id) AS bookable
             FROM listings l
             JOIN users u ON u.id = l.operator_id
            WHERE l.id = $1`,
          [listingId]
        );
        if (opInfo?.email && String(opInfo.email).toLowerCase() !== "unclaimed@vakaygo.com") {
          import("@/server/mail-client")
            .then(({ sendEmail }) =>
              sendEmail({
                from: "VakayGo <hello@vakaygo.com>",
                to: String(opInfo.email),
                replyTo: "support@vakaygo.com",
                subject: `Your VakayGo payout profile for "${opInfo.title}" is verified!`,
                html: `<p>Hi ${opInfo.name || "there"},</p>
<p>Your payout profile for <strong>${opInfo.title}</strong> has been verified by our compliance team.</p>
<p>${
                  opInfo.bookable
                    ? "Your listing is now <strong>active and accepting online bookings</strong> on VakayGo!"
                    : `Finish any remaining listing details at <a href="https://vakaygo.com/operator/onboarding/${listingId}">your onboarding page</a> to go live for online bookings.`
                }</p>`,
              })
            )
            .catch(() => {});
        }
      }

      return NextResponse.json({ success: true, profile: updated });
    }

    if (body?.action === "complete_payout") {
      const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
      const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim().slice(0, 250) : "";

      if (!payoutId || paymentReference.length < 3) {
        return NextResponse.json(
          { error: "A payoutId and settlement reference (Wise transfer ID, PayPal batch ID, or wire reference) are required" },
          { status: 400 }
        );
      }

      const [completed] = await sql.query(
        `UPDATE payouts
            SET status = 'completed',
                payment_reference = $2,
                paid_at = now()
          WHERE id = $1 AND status IN ('pending', 'processing')
      RETURNING id, operator_id, amount, currency`,
        [payoutId, paymentReference]
      );

      if (!completed) {
        return NextResponse.json({ error: "Pending payout not found" }, { status: 404 });
      }

      await sql.query(
        `INSERT INTO audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, 'payout_completed', 'payout', $2, $3::json)`,
        [auth.userId, payoutId, JSON.stringify({ paymentReference, amount: completed.amount, currency: completed.currency })]
      );

      return NextResponse.json({ success: true, payout: completed });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    logger.error("Admin payout profiles PATCH error", error);
    return NextResponse.json({ error: "Failed to update payout record" }, { status: 500 });
  }
}
