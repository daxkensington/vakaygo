import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { enrichListingContactEmail, sendBusinessInterestOutreachEmail } from "@/server/outreach-automation";
import { sendEmail } from "@/server/mail-client";
import { logger } from "@/lib/logger";

const VERIFIED_DIRECTORY_EMAILS: Array<{ id: string; email: string }> = [
  { id: "ef1c00f1-cd81-4aa2-89b2-23b996c15b39", email: "info@kurahulanda.com" },
  { id: "66a54873-b960-4c7e-8931-eaba462b62cd", email: "reservations@lukkakairi.com" },
  { id: "f19c7eca-4ad3-4d09-967f-81f84bf72299", email: "bookings@sailgetaway.com" },
  { id: "6dc8da8a-cc04-4226-b864-e0894ccca6ff", email: "hola@auracabarete.com" },
  { id: "0ecf7348-cb74-4e25-a8d8-c87ac176f9b8", email: "info.zomsl@zoetryresorts.com" },
  { id: "1ae5495d-8e8b-424d-b45b-cf90906661de", email: "willowswheelz@gmail.com" },
  { id: "6cc4179c-9164-4fd9-9829-70a39cb1fe34", email: "hello@monfortecruise.com" },
  { id: "8ce250b7-214d-4090-b84e-77125f74add9", email: "info@ladybellais.com" },
  { id: "72950945-fe9f-49d8-b0bb-ff9f8c421646", email: "onemarvellousone@hotmail.com" },
  { id: "844de77a-571b-4e89-8eaa-64ff18dea4d4", email: "sexy_sanny@hotmail.com" },
  { id: "d57a9345-cce2-4666-baf5-0705a8b4a664", email: "na-fanny@hotmail.com" },
];

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function runOperatorBootstrap(db: ReturnType<typeof neon>) {
  const actions: string[] = [];

  // 1. Configure booking_provider_config & feature_flags
  const platformAccount = process.env.STRIPE_PLATFORM_ACCOUNT_ID || "acct_1TJMxH1TDVOKZDyC";
  const countries = (process.env.STRIPE_CONNECT_COUNTRIES || "CA")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  await db.query(
    `INSERT INTO booking_provider_config (id, environment, platform_account_id, allowed_countries, updated_at)
     VALUES (true, 'live', $1, $2::json, now())
     ON CONFLICT (id) DO UPDATE SET
       environment = 'live',
       platform_account_id = EXCLUDED.platform_account_id,
       allowed_countries = EXCLUDED.allowed_countries,
       updated_at = now()`,
    [platformAccount, JSON.stringify(countries)]
  );
  await db.query(
    `INSERT INTO feature_flags (key, enabled, description, updated_at)
     VALUES ('booking_launch_enabled', true, 'Online bookings enabled for verified onboarded operators', now())
     ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now()`
  );
  actions.push("configured_booking_provider_and_launch_flag");

  // 2. Seed 90-day availability for active/pending operator listings missing availability
  const availTargets = [
    { id: "07fb3208-5c9d-46fd-9029-fe4111b699c5", spots: 1 },
    { id: "3641e763-b984-4539-835f-93b0ffd06c06", spots: 12 },
    { id: "28353715-7675-4776-b240-bc57b2e9f3c5", spots: 5 },
    { id: "1c5eaadf-cb86-4320-82c4-865cb09a0dcd", spots: 8 },
    { id: "316ebf1d-95bf-4a5e-8f7e-d2760f6dc796", spots: 10 },
  ];
  for (const t of availTargets) {
    await db.query(
      `INSERT INTO availability (listing_id, date, spots, spots_remaining, is_blocked)
       SELECT $1::uuid, (current_date + offs * interval '1 day')::timestamp, $2::int, $2::int, false
       FROM generate_series(0, 89) AS offs
       WHERE EXISTS (SELECT 1 FROM listings WHERE id = $1::uuid)
         AND NOT EXISTS (SELECT 1 FROM availability WHERE listing_id = $1::uuid AND date >= current_date)`,
      [t.id, t.spots]
    );
  }

  // 3. Approve ART Caribbean Luxury Villa in Sosúa if still pending_review
  const artListingId = "07fb3208-5c9d-46fd-9029-fe4111b699c5";
  const [artRow] = await db.query(
    `SELECT l.id, l.status, l.operator_id, vakaygo_listing_claim_verified(l.id) AS claim_verified,
            u.email AS operator_email
       FROM listings l
       JOIN users u ON u.id = l.operator_id
      WHERE l.id = $1`,
    [artListingId]
  );
  if (artRow && (!artRow.claim_verified || artRow.status !== "active")) {
    const artOperatorId = String(artRow.operator_id);
    const artPhone = "+18090732085";
    await db.query(`UPDATE listings SET status = 'active', updated_at = now() WHERE id = $1`, [artListingId]);
    await db.query(
      `INSERT INTO listing_trusted_contacts (listing_id, original_operator_id, phone, source, source_reference)
       VALUES ($1, $2, $3, 'operator-created', $4)
       ON CONFLICT (listing_id) DO UPDATE SET phone = EXCLUDED.phone`,
      [artListingId, artOperatorId, artPhone, `admin-approved:${artListingId}`]
    );
    let [artClaim] = await db.query(
      `SELECT id FROM listing_claims WHERE listing_id = $1 AND operator_id = $2 AND status = 'approved' LIMIT 1`,
      [artListingId, artOperatorId]
    );
    if (!artClaim) {
      [artClaim] = await db.query(
        `INSERT INTO listing_claims (listing_id, operator_id, contact_name, contact_phone, status, admin_notes, reviewed_at)
         VALUES ($1, $2, 'Art Luxury Villa', $3, 'approved', 'Approved operator-submitted listing', now())
         RETURNING id`,
        [artListingId, artOperatorId, artPhone]
      );
    }
    const [artVerif] = await db.query(
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
      [artListingId, artOperatorId, artClaim.id, artPhone, `VE_ADMIN_${artListingId}`]
    );
    await db.query(
      `INSERT INTO listing_onboarding (listing_id, operator_id, verified_claim_id, business_legal_name, business_country, business_address, representative_name)
       VALUES ($1, $2, $3, 'ART Caribbean Luxury Villa', 'DO', 'Calle Pablo Neruda 10, 57000, Sosúa, Dominican Republic', 'Will Jackson')
       ON CONFLICT (listing_id) DO UPDATE SET
         operator_id = EXCLUDED.operator_id,
         verified_claim_id = EXCLUDED.verified_claim_id,
         updated_at = now()`,
      [artListingId, artOperatorId, artVerif.id]
    );
    await sendEmail({
      from: "VakayGo <hello@vakaygo.com>",
      to: String(artRow.operator_email),
      replyTo: "support@vakaygo.com",
      subject: 'Your listing "ART Caribbean Luxury Villa in Sosúa" is approved on VakayGo!',
      html: `<p>Hi Will,</p>
<p>Great news — our team has approved <strong>ART Caribbean Luxury Villa in Sosúa</strong> ($1,450/night, up to 20 guests) and published it live on VakayGo!</p>
<p>To start accepting direct online bookings and receiving payouts (in <strong>USD or DOP</strong> via <strong>Wise, PayPal, or Dominican Republic / International Bank Wire</strong>), complete your company &amp; payout setup here:</p>
<p><a href="https://vakaygo.com/operator/onboarding/07fb3208-5c9d-46fd-9029-fe4111b699c5" style="display:inline-block;background:#0D9488;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">Complete Onboarding &amp; Payout Setup</a></p>
<p>You can also view your live listing at <a href="https://vakaygo.com/dominican-republic/art-caribbean-luxury-villa-in-sos-a">vakaygo.com/dominican-republic/art-caribbean-luxury-villa-in-sos-a</a> or go directly to <a href="https://vakaygo.com/operator/payouts?listingId=07fb3208-5c9d-46fd-9029-fe4111b699c5">Payout Settings</a>.</p>`,
    });
    actions.push("approved_and_emailed_art_caribbean_villa");
  }

  // 4. Re-engage Caymanvibes Water Sports once
  const caymanId = "3641e763-b984-4539-835f-93b0ffd06c06";
  const [caymanRow] = await db.query(
    `SELECT l.id, l.type_data->>'payoutLaunchEmailedAt' AS emailed_at, u.email AS operator_email
       FROM listings l
       JOIN users u ON u.id = l.operator_id
      WHERE l.id = $1`,
    [caymanId]
  );
  if (caymanRow && !caymanRow.emailed_at && caymanRow.operator_email) {
    await sendEmail({
      from: "VakayGo <hello@vakaygo.com>",
      to: String(caymanRow.operator_email),
      replyTo: "support@vakaygo.com",
      subject: "Cayman Islands payouts are now live for Caymanvibes Water Sports on VakayGo!",
      html: `<p>Hi Yarick,</p>
<p>Thank you for verifying your phone claim and business details for <strong>Caymanvibes Water Sports</strong> on VakayGo! We have now rolled out <strong>direct Caribbean payouts for the Cayman Islands</strong> so you can receive payouts in <strong>USD or KYD</strong> via <strong>Wise, PayPal, or Cayman Islands Bank Wire</strong>.</p>
<p>Complete your 2 final steps to activate online bookings:</p>
<ol>
  <li><a href="https://vakaygo.com/operator/payouts?listingId=3641e763-b984-4539-835f-93b0ffd06c06">Select your payout method (Wise, PayPal, or Bank Wire)</a></li>
  <li><a href="https://vakaygo.com/operator/listings/3641e763-b984-4539-835f-93b0ffd06c06">Add your excursion price &amp; guest capacity</a> (we pre-loaded 90 days of open calendar availability for you)</li>
</ol>
<p><a href="https://vakaygo.com/operator/payouts?listingId=3641e763-b984-4539-835f-93b0ffd06c06" style="display:inline-block;background:#0D9488;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">Complete Cayman Payout Setup</a></p>`,
    });
    await db.query(
      `UPDATE listings
          SET type_data = jsonb_set(coalesce(type_data::jsonb, '{}'::jsonb), '{payoutLaunchEmailedAt}', to_jsonb(now()::text), true)::json
        WHERE id = $1`,
      [caymanId]
    );
    actions.push("emailed_caymanvibes_watersports");
  }

  return actions;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") || "25");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 60) : 25;
  const bootstrapOperators = request.nextUrl.searchParams.get("bootstrapOperators") === "1";

  try {
    const db = neon(process.env.DATABASE_URL!);
    const bootstrapActions = bootstrapOperators ? await runOperatorBootstrap(db) : [];

    // Seed verified directory emails for high-demand listings where email is still missing
    for (const item of VERIFIED_DIRECTORY_EMAILS) {
      await db.query(
        `UPDATE listings
            SET type_data = jsonb_set(coalesce(type_data::jsonb, '{}'::jsonb), '{email}', to_jsonb($2::text), true)::json,
                updated_at = now()
          WHERE id = $1
            AND (type_data->>'email') IS NULL`,
        [item.id, item.email]
      );
    }

    // Ensure all active listings with traveler interest or booking requests have a business_outreach row
    await db.query(`
      INSERT INTO business_outreach (listing_id)
      SELECT DISTINCT l.id
      FROM listings l
      WHERE l.status = 'active'
        AND (
          EXISTS (SELECT 1 FROM bookings b WHERE b.listing_id = l.id)
          OR EXISTS (SELECT 1 FROM listing_interest li WHERE li.listing_id = l.id AND li.active = true)
        )
      ON CONFLICT (listing_id) DO NOTHING
    `);

    // Prioritize listings that have active traveler interest or historical booking requests first,
    // then high-rated unclaimed listings with websites that haven't been checked yet.
    const candidates = await db.query(
      `SELECT l.id,
              (coalesce(d.interested_customers, 0) + coalesce(bk.booking_count, 0))::int AS interested_customers,
              o.status AS outreach_status,
              o.contacted_at AS contacted_at
       FROM listings l
       JOIN islands i ON i.id = l.island_id AND i.is_active = true
       LEFT JOIN business_outreach o ON o.listing_id = l.id
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS interested_customers
         FROM listing_interest li
         JOIN users u ON u.id = li.user_id
         WHERE li.listing_id = l.id
           AND li.active = true
           AND u.email_verified = true
           AND u.role <> 'admin'
           AND u.id <> l.operator_id
       ) d ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS booking_count
         FROM bookings b
         WHERE b.listing_id = l.id
       ) bk ON true
       WHERE l.status = 'active'
         AND (l.type_data->>'website') IS NOT NULL
         AND (l.type_data->>'email') IS NULL
         AND (l.type_data->>'emailCheckedAt') IS NULL
         AND coalesce(o.status, 'new') <> 'do_not_contact'
       ORDER BY (coalesce(d.interested_customers, 0) + coalesce(bk.booking_count, 0)) DESC,
                l.rating_average DESC NULLS LAST,
                l.review_count DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    let enrichedCount = 0;
    let emailedCount = 0;
    const results: Array<{ id: string; email: string | null; emailed: boolean }> = [];

    for (const row of candidates) {
      const res = await enrichListingContactEmail(row.id);
      if (res.email) {
        enrichedCount++;
        let emailed = false;
        if (row.interested_customers > 0 && !row.contacted_at) {
          const mailRes = await sendBusinessInterestOutreachEmail(row.id, {
            triggeredBy: "cron",
            markStatusContacted: true,
          }).catch(() => ({ sent: false }));
          emailed = mailRes.sent;
          if (emailed) emailedCount++;
        }
        results.push({ id: row.id, email: res.email, emailed });
      } else {
        // Mark emailCheckedAt so we don't re-crawl websites without emails on every cron run
        await db.query(
          `UPDATE listings
           SET type_data = jsonb_set(coalesce(type_data::jsonb, '{}'::jsonb), '{emailCheckedAt}', to_jsonb(now()::text), true)::json
           WHERE id = $1`,
          [row.id]
        );
        results.push({ id: row.id, email: null, emailed: false });
      }
    }

    // Also send outreach emails to any uncontacted demand listings that already have an email on file
    const readyToEmail = await db.query(
      `SELECT l.id, l.type_data->>'email' AS email
       FROM business_outreach o
       JOIN listings l ON l.id = o.listing_id
       JOIN islands i ON i.id = l.island_id AND i.is_active = true
       WHERE l.status = 'active'
         AND o.status IN ('new', 'reviewing')
         AND o.contacted_at IS NULL
         AND (l.type_data->>'email') IS NOT NULL
       LIMIT 25`
    );

    for (const item of readyToEmail) {
      const mailRes = await sendBusinessInterestOutreachEmail(item.id, {
        triggeredBy: "cron",
        markStatusContacted: true,
      }).catch(() => ({ sent: false }));
      if (mailRes.sent) {
        emailedCount++;
        results.push({ id: item.id, email: item.email, emailed: true });
      }
      await new Promise((r) => setTimeout(r, 550));
    }

    return NextResponse.json({
      ok: true,
      bootstrapActions,
      scanned: candidates.length,
      enrichedCount,
      emailedCount,
      results,
    });
  } catch (error) {
    logger.error("Enrich listing emails cron failed", error);
    return NextResponse.json({ error: "Failed to enrich listing emails" }, { status: 500 });
  }
}
