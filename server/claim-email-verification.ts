import { createHmac, randomInt, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { sendEmail } from "@/server/mail-client";
import { revalidateListing } from "@/lib/revalidate-listing";
import { SESSION_SECRET } from "@/lib/env";
import { requireUser } from "@/server/admin-auth";
import { CLAIM_REPLAY_SQL, FINISH_CLAIM_SQL, claimTransaction, type ClaimActor } from "@/server/claim-transactions";
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

function hashOtp(listingId: string, operatorId: string, email: string, verificationId: string, code: string): string {
  // The service_sid identifies the proof type. Only the 64-character digest
  // belongs in provider_verification_id (varchar64). Binding the published
  // email and challenge ID also invalidates codes after contact replacement.
  return createHmac("sha256", SESSION_SECRET()).update(JSON.stringify([listingId, operatorId, email, verificationId, code])).digest("hex");
}

async function currentActor(operatorId: string): Promise<ClaimActor> {
  const auth = await requireUser();
  if (!auth.ok) throw new OnboardingError("Please sign in again.", 401);
  if (auth.userId !== operatorId || !auth.emailVerified || !["operator", "admin"].includes(auth.role))
    throw new OnboardingError("A verified business account is required.", 403);
  return auth;
}

function matchesBusinessEmail(userEmail: string | null, businessEmail: string | null, website: unknown): boolean {
  const domain = extractDomain(userEmail);
  return !!userEmail && (userEmail === businessEmail || !!domain && [extractDomain(businessEmail), extractDomain(website)].includes(domain));
}

function escaped(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function fallbackE164Phone(listingId: string): string {
  const hex = listingId.replace(/-/g, "").slice(0, 10);
  const num = (BigInt("0x" + hex) % BigInt("8000000000")) + BigInt("2000000000");
  return `+1${num.toString()}`;
}

type ClaimProof =
  | { kind: "email"; verificationId: string; hash: string; businessEmail: string }
  | { kind: "domain"; operatorEmail: string; businessEmail: string | null; website: string | null; matches: boolean }
  | { kind: "admin"; claimId: string };

export async function finalizeVerifiedClaimInDb(
  listingId: string, operatorId: string, actor: ClaimActor, evidence: ClaimProof, adminNote: string,
): Promise<string> {
  assertListingId(listingId);
  const isAdmin = evidence.kind === "admin";
  if (isAdmin && actor.role !== "admin") throw new OnboardingError("Administrator review required", 403);
  let statement: string;
  let values: unknown[];
  let prepare: string | undefined;
  if (evidence.kind === "email") {
    values = [adminNote, false, evidence.verificationId, evidence.hash, evidence.businessEmail];
    statement = `${CLAIM_REPLAY_SQL.replace("AND v.status='verified'", "AND v.id=$8::uuid AND v.status='verified'")},
      attempt AS (
        UPDATE listing_claim_verifications v SET attempts=v.attempts+1,
          status=CASE WHEN v.provider_verification_id=$9 THEN 'verified' ELSE v.status END,
          provider_approved_at=CASE WHEN v.provider_verification_id=$9 THEN now() ELSE NULL END,
          verified_at=CASE WHEN v.provider_verification_id=$9 THEN now() ELSE NULL END,
          check_token=NULL,check_locked_until=NULL,updated_at=now()
        FROM target t,listing_claims c,listing_trusted_contacts tc
        WHERE v.id=$8::uuid AND v.listing_id=t.id AND v.operator_id=$5::uuid AND v.service_sid='vakaygo_email_otp'
          AND v.provider_account_id='vakaygo' AND v.status='pending' AND v.expires_at>now() AND v.attempts<5
          AND c.id=v.claim_id AND c.listing_id=t.id AND c.operator_id=$5::uuid AND c.status='pending'
          AND tc.listing_id=t.id AND tc.phone=v.target_phone AND tc.original_operator_id=t.operator_id
          AND lower(trim(t.type_data->>'email'))=$10
        RETURNING v.id,v.claim_id,v.provider_verification_id=$9 AS matched
      ), proof AS (SELECT id,claim_id FROM attempt WHERE matched)
      ${FINISH_CLAIM_SQL},EXISTS(SELECT 1 FROM attempt WHERE NOT matched) AS "incorrectCode",
      1/CASE WHEN NOT EXISTS(SELECT 1 FROM actor) OR EXISTS(SELECT 1 FROM attempt WHERE NOT matched)
        OR EXISTS(SELECT 1 FROM onboarded) OR EXISTS(SELECT 1 FROM replay) THEN 1 ELSE 0 END AS "claimCommitted"`;
  } else {
    // Domain proof is computed server-side and bound to the exact current
    // account and listing contact values again at the write. Admin approval
    // keeps the selected request, including its notes and reviewer identity.
    const domain = evidence.kind === "domain" ? evidence : null;
    values = [adminNote, isAdmin, isAdmin ? evidence.claimId : null, fallbackE164Phone(listingId),
      domain?.operatorEmail || null, domain?.businessEmail || null, domain?.website || null, domain?.matches || false];
    const eligibleSql = `,
      eligible AS MATERIALIZED (
        SELECT t.* FROM target t CROSS JOIN claimant u
        WHERE ($7::boolean OR ($13::boolean AND lower(trim(u.email))=$10
          AND nullif(lower(trim(t.type_data->>'email')),'') IS NOT DISTINCT FROM $11::text
          AND t.type_data->>'website' IS NOT DISTINCT FROM $12::text))
          AND NOT EXISTS(SELECT 1 FROM listing_claim_verifications v WHERE v.listing_id=t.id
            AND v.status IN ('sending','pending','verified') AND (v.operator_id<>$5::uuid OR v.status='verified'))
          AND (NOT $7::boolean OR EXISTS(SELECT 1 FROM listing_claims c WHERE c.id=$8::uuid
            AND c.listing_id=t.id AND c.operator_id=$5::uuid AND c.status='pending'))
      )`;
    prepare = `${eligibleSql}, inserted_contact AS (
        INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
        SELECT id,operator_id,$9,'verified_claim',CASE WHEN $7::boolean THEN 'admin-review' ELSE 'domain-verified' END
        FROM eligible WHERE trusted_phone IS NULL RETURNING listing_id,phone
      ), contact AS MATERIALIZED (
        SELECT id AS listing_id,trusted_phone AS phone FROM eligible WHERE trusted_phone IS NOT NULL
        UNION ALL SELECT listing_id,phone FROM inserted_contact
      ), existing_claim AS MATERIALIZED (
        SELECT c.id,c.listing_id FROM listing_claims c JOIN eligible t ON t.id=c.listing_id
        WHERE c.operator_id=$5::uuid AND c.status='pending'
          AND (NOT $7::boolean OR c.id=$8::uuid)
          AND (NOT EXISTS(SELECT 1 FROM listing_claim_verifications v WHERE v.listing_id=t.id AND v.status IN ('sending','pending'))
            OR EXISTS(SELECT 1 FROM listing_claim_verifications v WHERE v.claim_id=c.id AND v.operator_id=$5::uuid AND v.status IN ('sending','pending')))
        ORDER BY c.created_at DESC,c.id LIMIT 1
      ), inserted_claim AS (
        INSERT INTO listing_claims(listing_id,operator_id,contact_name,contact_phone)
        SELECT t.id,$5::uuid,coalesce(nullif(u.name,''),'Business Representative'),tc.phone
        FROM eligible t JOIN contact tc ON tc.listing_id=t.id CROSS JOIN claimant u
        WHERE NOT $7::boolean AND NOT EXISTS(SELECT 1 FROM existing_claim)
        RETURNING id,listing_id
      ), chosen_claim AS MATERIALIZED (
        SELECT * FROM existing_claim UNION ALL SELECT * FROM inserted_claim
      ), updated_proof AS (
        UPDATE listing_claim_verifications v SET status='pending',expires_at=now()+interval '10 minutes',
          service_sid=CASE WHEN $7::boolean THEN 'vakaygo_admin_review' ELSE 'vakaygo_domain_verify' END,
          provider_account_id='vakaygo',provider_verification_id=concat(CASE WHEN $7::boolean THEN 'admin:' ELSE 'domain:' END,v.claim_id),
          provider_approved_at=now(),verified_at=NULL,check_token=NULL,check_locked_until=NULL,updated_at=now()
        FROM chosen_claim c,contact tc WHERE v.claim_id=c.id AND v.listing_id=c.listing_id AND v.operator_id=$5::uuid
          AND v.status IN ('sending','pending','expired','failed') AND v.target_phone=tc.phone
        RETURNING v.id,v.claim_id
      ), inserted_proof AS (
        INSERT INTO listing_claim_verifications(listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,
          provider_verification_id,status,provider_approved_at,verified_at)
        SELECT c.listing_id,$5::uuid,c.id,tc.phone,
          CASE WHEN $7::boolean THEN 'vakaygo_admin_review' ELSE 'vakaygo_domain_verify' END,'vakaygo',
          concat(CASE WHEN $7::boolean THEN 'admin:' ELSE 'domain:' END,c.id),'pending',now(),NULL
        FROM chosen_claim c JOIN contact tc ON tc.listing_id=c.listing_id
        WHERE NOT EXISTS(SELECT 1 FROM listing_claim_verifications v WHERE v.claim_id=c.id)
        RETURNING id,claim_id
      ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",$6::text AS note,
        (SELECT count(*) FROM updated_proof)+(SELECT count(*) FROM inserted_proof) AS prepared`;
    // PostgreSQL data-changing CTEs share a snapshot: an UPDATE cannot target
    // a claim inserted by a sibling CTE. Prepare the exact pending proof first,
    // then consume it in a fresh statement inside this same locked transaction.
    statement = `${CLAIM_REPLAY_SQL}${isAdmin ? ", selected_replay AS (SELECT claim_id FROM replay WHERE claim_id=$8::uuid)" : ""}${eligibleSql},
      proof AS (
        UPDATE listing_claim_verifications v SET status='verified',verified_at=now(),provider_approved_at=now(),updated_at=now()
        FROM eligible t,listing_claims c,listing_trusted_contacts tc
        WHERE v.listing_id=t.id AND v.operator_id=$5::uuid AND v.status='pending' AND v.expires_at>now()
          AND v.claim_id=c.id AND c.status='pending' AND c.listing_id=t.id AND c.operator_id=$5::uuid
          AND (NOT $7::boolean OR c.id=$8::uuid) AND tc.listing_id=t.id AND tc.phone=v.target_phone
          AND tc.original_operator_id=t.operator_id AND v.provider_account_id='vakaygo'
          AND v.service_sid=CASE WHEN $7::boolean THEN 'vakaygo_admin_review' ELSE 'vakaygo_domain_verify' END
          AND v.provider_verification_id=concat(CASE WHEN $7::boolean THEN 'admin:' ELSE 'domain:' END,c.id)
          AND $9::text IS NOT NULL
        RETURNING v.id,v.claim_id
      ) ${isAdmin ? FINISH_CLAIM_SQL.replace("(SELECT claim_id FROM replay)", "(SELECT claim_id FROM selected_replay)") : FINISH_CLAIM_SQL}`;
    // PostgreSQL has no built-in SQL ASSERT. An explicit runtime arithmetic
    // assertion aborts this static transaction if no completion/valid replay
    // exists, including a trigger that suppresses a downstream write.
    statement += `,1/CASE WHEN NOT EXISTS(SELECT 1 FROM actor) OR EXISTS(SELECT 1 FROM onboarded) OR EXISTS(SELECT 1 FROM ${isAdmin ? "selected_replay" : "replay"}) THEN 1 ELSE 0 END AS "claimCommitted"`;
  }
  const result = await claimTransaction(actor, listingId, operatorId, statement, values, { expireChallenges: evidence.kind !== "email", prepare });
  if (result.incorrectCode) throw new OnboardingError("The verification code is incorrect", 400);
  if (typeof result.claimId !== "string") throw new OnboardingError("Verification expired, another claim is active, or the account/business contact changed. Refresh the claim status.", 409);
  await revalidateListing(listingId);
  return result.claimId;
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
  if (!["sms", "call", "email"].includes(channel)) throw new OnboardingError("Choose email, text message or voice call");
  const actor = await currentActor(operatorId);
  if (cleanEmail(operatorEmail) !== cleanEmail(actor.email)) throw new OnboardingError("Your account changed. Please sign in again.", 401);
  if (channel === "sms" || channel === "call") return startClaimVerification(listingId, operatorId, channel);
  const db = sql();
  const [row] = await db`
    SELECT type_data->>'email' AS business_email FROM listings WHERE id=${listingId}::uuid
  `;
  const bizEmail = cleanEmail(row?.business_email);
  if (!bizEmail) {
    throw new OnboardingError("Automated verification is unavailable; submit a claim request for team review", 503);
  }
  const code = String(randomInt(100000, 1000000));
  const verificationId = randomUUID();
  const otpHash = hashOtp(listingId, operatorId, bizEmail, verificationId, code);
  const started = await claimTransaction(actor, listingId, operatorId, `,
    eligible AS MATERIALIZED (
      SELECT t.* FROM target t WHERE lower(trim(t.type_data->>'email'))=$6
        AND NOT EXISTS(SELECT 1 FROM listing_claim_verifications v WHERE v.listing_id=t.id AND v.status IN ('sending','pending','verified'))
        AND (SELECT count(*) FROM listing_claim_verifications v WHERE (v.listing_id=t.id OR v.operator_id=$5::uuid)
          AND v.created_at>now()-interval '1 hour')<5
    ), inserted_contact AS (
      INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
      SELECT id,operator_id,$7,'email_otp',$6 FROM eligible WHERE trusted_phone IS NULL
      RETURNING listing_id,phone
    ), contact AS MATERIALIZED (
      SELECT id AS listing_id,trusted_phone AS phone FROM eligible WHERE trusted_phone IS NOT NULL
      UNION ALL SELECT listing_id,phone FROM inserted_contact
    ), claim AS (
      INSERT INTO listing_claims(listing_id,operator_id,contact_name,contact_phone)
      SELECT t.id,$5::uuid,coalesce(nullif(u.name,''),'Business Representative'),tc.phone
      FROM eligible t JOIN contact tc ON tc.listing_id=t.id CROSS JOIN claimant u RETURNING id,listing_id
    ), challenge AS (
      INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status)
      SELECT $8::uuid,c.listing_id,$5::uuid,c.id,tc.phone,'vakaygo_email_otp','vakaygo',$9,'sending'
      FROM claim c JOIN contact tc ON tc.listing_id=c.listing_id RETURNING id,claim_id
    ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",(SELECT id FROM challenge) AS "verificationId",
      (SELECT claim_id FROM challenge) AS "claimId",(SELECT title FROM eligible) AS title`,
  [bizEmail, fallbackE164Phone(listingId), verificationId, otpHash], { expireChallenges: true });
  if (started.verificationId !== verificationId) throw new OnboardingError("A verification is active, the request limit was reached, or this business changed. Refresh the claim status.", 409);
  try {
    await sendEmail({
      from: "VakayGo <support@vakaygo.com>",
      to: bizEmail,
      subject: `${code} is your VakayGo verification code for ${String(started.title)}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
        <p style="margin:0 0 12px;">Hi there,</p>
        <p style="margin:0 0 16px;">Use the verification code below to confirm ownership of <strong>${escaped(String(started.title))}</strong> on VakayGo:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:4px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;color:#0f172a;">${code}</div>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b;">This code expires in 10 minutes. If you did not request this code, you can safely ignore this email.</p>
      </div>`,
    });
    const pending = await claimTransaction(actor, listingId, operatorId, `,
      updated AS (
        UPDATE listing_claim_verifications v SET status='pending',updated_at=now() FROM target t
        WHERE v.id=$6::uuid AND v.listing_id=t.id AND v.operator_id=$5::uuid AND v.status='sending' AND v.expires_at>now()
          AND lower(trim(t.type_data->>'email'))=$7 AND v.target_phone=t.trusted_phone
        RETURNING v.id
      ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",(SELECT id FROM updated) AS "verificationId"`, [verificationId, bizEmail]);
    if (pending.verificationId !== verificationId) throw new OnboardingError("Verification changed; refresh this page.", 409);
  } catch (error) {
    await db`UPDATE listing_claim_verifications SET status='failed',updated_at=now()
      WHERE id=${verificationId}::uuid AND operator_id=${operatorId}::uuid AND status='sending'`;
    if (error instanceof OnboardingError) throw error;
    throw new OnboardingError("Unable to send a code to the business email; please try again or request team review", 503);
  }
  return { claim: { id: started.claimId, status: "pending" }, verification: { state: "pending", channel: "email" } };
}

export async function completeEnhancedClaimVerification(listingId: string, operatorId: string, code: unknown) {
  assertListingId(listingId);
  if (typeof code !== "string" || !/^[0-9]{4,10}$/.test(code)) {
    throw new OnboardingError("Enter the verification code", 400);
  }

  const actor = await currentActor(operatorId);
  const db = sql();
  const [latest] = await db`
    SELECT v.id,v.claim_id,v.service_sid,l.type_data->>'email' AS business_email
    FROM listing_claim_verifications v JOIN listings l ON l.id=v.listing_id
    WHERE v.listing_id = ${listingId}::uuid AND v.operator_id = ${operatorId}::uuid
    ORDER BY v.created_at DESC,v.id DESC
    LIMIT 1
  `;

  if (latest && latest.service_sid === "vakaygo_email_otp") {
    // A missing/changed contact cannot satisfy a pending challenge, but must
    // not prevent a verified current owner from replaying its committed result.
    const businessEmail = cleanEmail(latest.business_email) || "";
    const verificationId = String(latest.id);
    const claimId = await finalizeVerifiedClaimInDb(listingId, operatorId, actor, {
      kind: "email", verificationId, businessEmail,
      hash: hashOtp(listingId, operatorId, businessEmail, verificationId, code),
    }, "Verified via business email code");
    return { claim: { id: claimId, status: "approved" }, verification: { state: "verified" }, onboardingUrl: "/operator/onboarding/" + listingId };
  }

  return completeClaimVerification(listingId, operatorId, code);
}

export async function completeInstantDomainClaim(listingId: string, operatorId: string, operatorEmail: string) {
  assertListingId(listingId);
  const actor = await currentActor(operatorId);
  const [meta] = await sql()`SELECT type_data->>'email' AS business_email,type_data->>'website' AS website
    FROM listings WHERE id=${listingId}::uuid`;
  const businessEmail = cleanEmail(meta?.business_email), userEmail = cleanEmail(operatorEmail);
  const website = typeof meta?.website === "string" ? meta.website : null;
  const claimId = await finalizeVerifiedClaimInDb(listingId, operatorId, actor, {
    kind: "domain", operatorEmail: userEmail || "", businessEmail, website,
    matches: matchesBusinessEmail(userEmail, businessEmail, website),
  }, "Verified via matching business email/domain");
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
