import { createHash, randomInt } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { sendEmail } from "@/server/mail-client";
import { revalidateListing } from "@/lib/revalidate-listing";
import {
  OnboardingError,
  assertListingId,
  completeClaimVerification,
  getClaimStatus,
  startClaimVerification,
} from "@/server/business-onboarding";

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "zoho.com", "gmx.com", "mail.com", "yandex.com", "vakaygo.com"
]);

function sql() {
  if (!process.env.DATABASE_URL) throw new OnboardingError("Business onboarding is unavailable", 503);
  return neon(process.env.DATABASE_URL);
}

function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return null;
  if (trimmed === "unclaimed@vakaygo.com") return null;
  return trimmed;
}

function extractDomain(emailOrUrl: unknown): string | null {
  if (typeof emailOrUrl !== "string" || !emailOrUrl.trim()) return null;
  const val = emailOrUrl.trim().toLowerCase();
  if (val.includes("@")) {
    const d = val.split("@")[1]?.replace(/^www\./, "").trim();
    return d && !PUBLIC_EMAIL_DOMAINS.has(d) ? d : null;
  }
  try {
    const u = new URL(val.startsWith("http") ? val : `https://${val}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!host || PUBLIC_EMAIL_DOMAINS.has(host)) return null;
    if (/facebook\.com|instagram\.com|linktr\.ee|tripadvisor\.|wa\.me|whatsapp\.com|google\.com/i.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}•••@${domain}`;
}

function hashOtp(listingId: string, operatorId: string, code: string): string {
  const secret = process.env.JWT_SECRET || process.env.CRON_SECRET || "vakaygo-claim";
  return createHash("sha256").update(`${listingId}:${operatorId}:${code}:${secret}`).digest("hex");
}

function fallbackE164Phone(listingId: string): string {
  const hex = listingId.replace(/-/g, "").slice(0, 10);
  const num = (BigInt("0x" + hex) % BigInt("8000000000")) + BigInt("2000000000");
  return `+1${num.toString()}`;
}

export async function finalizeVerifiedClaimInDb(
  listingId: string,
  operatorId: string,
  adminNote: string,
  providerTag: string
): Promise<string> {
  const db = sql();
  const [row] = await db`
    SELECT l.id, l.operator_id, u.name AS operator_name, tc.phone AS trusted_phone,
           EXISTS(SELECT 1 FROM users u2 WHERE u2.id = l.operator_id AND lower(u2.email) = 'unclaimed@vakaygo.com') AS unclaimed
    FROM listings l
    JOIN users u ON u.id = ${operatorId}::uuid
    LEFT JOIN listing_trusted_contacts tc ON tc.listing_id = l.id
    WHERE l.id = ${listingId}::uuid
  `;
  if (!row) throw new OnboardingError("Listing not found", 404);
  if (!row.unclaimed && row.operator_id !== operatorId) {
    throw new OnboardingError("This listing has already been claimed by another account", 409);
  }

  let phone = row.trusted_phone as string | null;
  if (!phone) {
    phone = fallbackE164Phone(listingId);
    await db`
      INSERT INTO listing_trusted_contacts (listing_id, original_operator_id, phone, source, source_reference)
      VALUES (${listingId}::uuid, ${row.operator_id}::uuid, ${phone}, 'verified_claim', ${providerTag})
      ON CONFLICT (listing_id) DO UPDATE SET phone = EXCLUDED.phone
    `;
  }

  const [claim] = await db`
    INSERT INTO listing_claims (listing_id, operator_id, status, contact_name, contact_phone, admin_notes, reviewed_at)
    VALUES (
      ${listingId}::uuid,
      ${operatorId}::uuid,
      'approved',
      ${row.operator_name || "Business Representative"},
      ${phone},
      ${adminNote},
      NOW()
    )
    RETURNING id
  `;

  const providerId = `${providerTag}:${claim.id}`;
  const [verif] = await db`
    INSERT INTO listing_claim_verifications (
      listing_id, operator_id, claim_id, target_phone, service_sid, provider_account_id,
      provider_verification_id, status, provider_approved_at, verified_at, expires_at
    )
    VALUES (
      ${listingId}::uuid, ${operatorId}::uuid, ${claim.id}::uuid, ${phone},
      'vakaygo_email_verify', 'vakaygo', ${providerId}, 'verified', NOW(), NOW(), NOW() + interval '1 day'
    )
    RETURNING id
  `;

  await db`
    UPDATE listings
    SET operator_id = ${operatorId}::uuid,
        type_data = (coalesce(type_data::jsonb, '{}'::jsonb) || '{"unclaimed": false}'::jsonb)::json,
        updated_at = NOW()
    WHERE id = ${listingId}::uuid
  `;

  await db`
    INSERT INTO listing_onboarding (listing_id, operator_id, verified_claim_id)
    VALUES (${listingId}::uuid, ${operatorId}::uuid, ${verif.id}::uuid)
    ON CONFLICT (listing_id) DO UPDATE
    SET operator_id = EXCLUDED.operator_id,
        verified_claim_id = EXCLUDED.verified_claim_id,
        updated_at = NOW()
  `;

  await db`
    UPDATE listing_claims
    SET status = 'rejected', admin_notes = 'Another verified claim was completed', reviewed_at = NOW(), updated_at = NOW()
    WHERE listing_id = ${listingId}::uuid AND id <> ${claim.id}::uuid AND status = 'pending'
  `;

  await revalidateListing(listingId);
  return claim.id as string;
}

export async function getEnhancedClaimStatus(listingId: string, operatorId: string, operatorEmail: string) {
  const base = await getClaimStatus(listingId, operatorId);
  if (base.claimVerified || !base.listing.unclaimed) return base;

  const db = sql();
  const [meta] = await db`
    SELECT l.type_data->>'email' AS business_email,
           l.type_data->>'website' AS business_website
    FROM listings l
    WHERE l.id = ${listingId}::uuid
  `;
  const bizEmail = cleanEmail(meta?.business_email);
  const userEmail = cleanEmail(operatorEmail);
  const userDomain = extractDomain(userEmail);
  const bizEmailDomain = extractDomain(bizEmail);
  const bizWebDomain = extractDomain(meta?.business_website);

  const exactEmailMatch = Boolean(bizEmail && userEmail && bizEmail === userEmail);
  const domainMatch = Boolean(
    userDomain && ((bizEmailDomain && userDomain === bizEmailDomain) || (bizWebDomain && userDomain === bizWebDomain))
  );
  const instantEligible = exactEmailMatch || domainMatch;
  const emailHint = bizEmail ? maskEmail(bizEmail) : null;

  const twilioAvailable = base.verification.available === true;
  const emailOtpAvailable = Boolean(bizEmail);
  const channels: ("sms" | "call" | "email")[] = [];
  if (twilioAvailable) channels.push("sms", "call");
  if (emailOtpAvailable) channels.push("email");

  return {
    ...base,
    listing: {
      ...base.listing,
      emailHint,
      instantEligible,
      matchedDomain: domainMatch ? userDomain : exactEmailMatch ? bizEmail : null,
    },
    verification: {
      ...base.verification,
      emailHint,
      instantEligible,
      available: twilioAvailable || emailOtpAvailable,
      canStart: (twilioAvailable || emailOtpAvailable) && base.verification.state !== "pending" && !base.verification.busyUntil,
      channels,
    },
  };
}

export async function startEnhancedClaimVerification(
  listingId: string,
  operatorId: string,
  operatorEmail: string,
  channel: "sms" | "call" | "email" = "sms"
) {
  assertListingId(listingId);
  if (channel === "sms" || channel === "call") {
    try {
      return await startClaimVerification(listingId, operatorId, channel);
    } catch (err) {
      // If Twilio is unconfigured and the listing has a business email, fall through to email OTP
      const status = await getEnhancedClaimStatus(listingId, operatorId, operatorEmail);
      if (!status.verification.channels.includes("email")) throw err;
    }
  }

  const db = sql();
  const [row] = await db`
    SELECT l.id, l.title, l.operator_id, l.type_data->>'email' AS business_email,
           u.name AS operator_name, tc.phone AS trusted_phone,
           EXISTS(SELECT 1 FROM users u2 WHERE u2.id = l.operator_id AND lower(u2.email) = 'unclaimed@vakaygo.com') AS unclaimed
    FROM listings l
    JOIN users u ON u.id = ${operatorId}::uuid
    LEFT JOIN listing_trusted_contacts tc ON tc.listing_id = l.id
    WHERE l.id = ${listingId}::uuid
  `;
  const bizEmail = cleanEmail(row?.business_email);
  if (!row || !row.unclaimed || !bizEmail) {
    throw new OnboardingError("Automated verification is unavailable; submit a claim request for team review", 503);
  }

  let phone = row.trusted_phone as string | null;
  if (!phone) {
    phone = fallbackE164Phone(listingId);
    await db`
      INSERT INTO listing_trusted_contacts (listing_id, original_operator_id, phone, source, source_reference)
      VALUES (${listingId}::uuid, ${row.operator_id}::uuid, ${phone}, 'email_otp', ${bizEmail})
      ON CONFLICT (listing_id) DO NOTHING
    `;
  }

  const code = String(randomInt(100000, 999999));
  const otpHash = `email-otp:${hashOtp(listingId, operatorId, code)}`;

  await db`
    UPDATE listing_claim_verifications
    SET status = 'expired', updated_at = NOW()
    WHERE listing_id = ${listingId}::uuid AND status IN ('sending', 'pending')
  `;

  const [claim] = await db`
    INSERT INTO listing_claims (listing_id, operator_id, contact_name, contact_phone)
    VALUES (${listingId}::uuid, ${operatorId}::uuid, ${row.operator_name || "Business Representative"}, ${phone})
    RETURNING id
  `;

  await db`
    INSERT INTO listing_claim_verifications (
      listing_id, operator_id, claim_id, target_phone, service_sid, provider_account_id,
      provider_verification_id, status
    )
    VALUES (
      ${listingId}::uuid, ${operatorId}::uuid, ${claim.id}::uuid, ${phone},
      'vakaygo_email_otp', 'vakaygo', ${otpHash}, 'pending'
    )
  `;

  try {
    await sendEmail({
      from: "VakayGo <support@vakaygo.com>",
      to: bizEmail,
      subject: `${code} is your VakayGo verification code for ${row.title}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
        <p style="margin:0 0 12px;">Hi there,</p>
        <p style="margin:0 0 16px;">Use the verification code below to confirm ownership of <strong>${row.title}</strong> on VakayGo:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:4px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;color:#0f172a;">${code}</div>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b;">This code expires in 10 minutes. If you did not request this code, you can safely ignore this email.</p>
      </div>`,
    });
  } catch {
    throw new OnboardingError("Unable to send a code to the business email; please try again or request team review", 503);
  }

  return { claim: { id: claim.id, status: "pending" }, verification: { state: "pending", channel: "email" } };
}

export async function completeEnhancedClaimVerification(listingId: string, operatorId: string, code: unknown) {
  assertListingId(listingId);
  if (typeof code !== "string" || !/^[0-9]{4,10}$/.test(code)) {
    throw new OnboardingError("Enter the verification code", 400);
  }

  const db = sql();
  const [latest] = await db`
    SELECT id, claim_id, service_sid, provider_verification_id, status, expires_at, attempts
    FROM listing_claim_verifications
    WHERE listing_id = ${listingId}::uuid AND operator_id = ${operatorId}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (latest && latest.service_sid === "vakaygo_email_otp") {
    if (latest.status === "verified") {
      return { claim: { id: latest.claim_id, status: "approved" }, verification: { state: "verified" }, onboardingUrl: "/operator/onboarding/" + listingId };
    }
    if (latest.status !== "pending" || Date.parse(String(latest.expires_at)) <= Date.now() || Number(latest.attempts) >= 5) {
      throw new OnboardingError("Verification expired or attempt limit reached; request a new code", 409);
    }
    const expected = `email-otp:${hashOtp(listingId, operatorId, code.trim())}`;
    if (latest.provider_verification_id !== expected) {
      await db`
        UPDATE listing_claim_verifications
        SET attempts = attempts + 1, updated_at = NOW()
        WHERE id = ${latest.id}::uuid
      `;
      throw new OnboardingError("The verification code is incorrect", 400);
    }
    const claimId = await finalizeVerifiedClaimInDb(listingId, operatorId, "Verified via business email code", "email-otp-verified");
    return { claim: { id: claimId, status: "approved" }, verification: { state: "verified" }, onboardingUrl: "/operator/onboarding/" + listingId };
  }

  return completeClaimVerification(listingId, operatorId, code);
}

export async function completeInstantDomainClaim(listingId: string, operatorId: string, operatorEmail: string) {
  assertListingId(listingId);
  const status = await getEnhancedClaimStatus(listingId, operatorId, operatorEmail);
  const instantEligible = (status.verification as { instantEligible?: boolean })?.instantEligible === true;
  if (!instantEligible) {
    throw new OnboardingError("Your account email does not match this listing's verified domain or business email", 403);
  }
  const claimId = await finalizeVerifiedClaimInDb(listingId, operatorId, `Verified via matching business email/domain (${operatorEmail})`, "domain-verified");
  return { claim: { id: claimId, status: "approved" }, verification: { state: "verified" }, onboardingUrl: "/operator/onboarding/" + listingId };
}

export async function submitManualClaimRequest(
  listingId: string,
  operatorId: string,
  operatorEmail: string,
  input: { contactPhone?: unknown; roleAtBusiness?: unknown; notes?: unknown }
) {
  assertListingId(listingId);
  const db = sql();
  const [row] = await db`
    SELECT l.id, l.title, l.slug, i.slug AS island_slug, u.name AS operator_name,
           EXISTS(SELECT 1 FROM users u2 WHERE u2.id = l.operator_id AND lower(u2.email) = 'unclaimed@vakaygo.com') AS unclaimed
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    JOIN users u ON u.id = ${operatorId}::uuid
    WHERE l.id = ${listingId}::uuid
  `;
  if (!row || !row.unclaimed) throw new OnboardingError("This listing cannot be claimed", 409);

  const phone = typeof input.contactPhone === "string" && input.contactPhone.trim() ? input.contactPhone.trim().slice(0, 40) : "Not provided";
  const role = typeof input.roleAtBusiness === "string" && input.roleAtBusiness.trim() ? input.roleAtBusiness.trim().slice(0, 80) : "Owner / Manager";
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 1000) : "";

  const [existing] = await db`
    SELECT id, status FROM listing_claims
    WHERE listing_id = ${listingId}::uuid AND operator_id = ${operatorId}::uuid AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `;
  if (existing) return { claim: { id: existing.id, status: "pending" }, submitted: true };

  const [claim] = await db`
    INSERT INTO listing_claims (listing_id, operator_id, status, contact_name, contact_phone, role_at_business, notes)
    VALUES (${listingId}::uuid, ${operatorId}::uuid, 'pending', ${row.operator_name || operatorEmail}, ${phone}, ${role}, ${notes})
    RETURNING id
  `;

  void sendEmail({
    from: "VakayGo <support@vakaygo.com>",
    to: "support@vakaygo.com",
    subject: `New Business Claim Request: ${row.title}`,
    html: `<p><strong>${row.operator_name || operatorEmail}</strong> (${operatorEmail}) requested to claim <strong>${row.title}</strong>.</p>
      <p>Role: ${role}<br/>Phone: ${phone}<br/>Notes: ${notes || "None"}</p>
      <p><a href="https://vakaygo.com/admin/claims">Review &amp; Approve in Admin Claims →</a></p>`,
  }).catch(() => {});

  return { claim: { id: claim.id, status: "pending" }, submitted: true };
}
