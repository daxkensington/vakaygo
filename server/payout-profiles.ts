import { neon } from "@neondatabase/serverless";
import { isCountryCode } from "@/lib/countries";
import { expireListingPendingCheckouts } from "@/server/booking-checkout-safety";
import { revalidateListing } from "@/lib/revalidate-listing";
import { OnboardingError, assertListingId } from "@/server/business-onboarding";

export const ALLOWED_PAYOUT_METHODS = ["paypal", "wise", "bank_wire"] as const;
export type PayoutMethod = (typeof ALLOWED_PAYOUT_METHODS)[number];

export const ALLOWED_PAYOUT_CURRENCIES = [
  "USD", "XCD", "BBD", "JMD", "KYD", "TTD", "DOP", "BSD", "AWG", "ANG", "EUR",
] as const;
export type PayoutCurrency = (typeof ALLOWED_PAYOUT_CURRENCIES)[number];

export type OperatorPayoutProfileRecord = {
  id: string;
  listingId: string;
  listingTitle: string;
  islandName: string;
  operatorId: string;
  payoutMethod: PayoutMethod;
  payoutCurrency: PayoutCurrency;
  paypalEmail: string | null;
  wiseRecipientEmail: string | null;
  wiseAccountId: string | null;
  bankName: string | null;
  bankCountry: string | null;
  bankAccountHolder: string | null;
  bankAccountNumberMasked: string | null;
  bankSwiftBic: string | null;
  bankRoutingOrBranch: string | null;
  intermediaryBankSwift: string | null;
  minimumPayoutUsd: number;
  w8benCertified: boolean;
  w8benBeneficialOwner: string | null;
  w8benCountry: string | null;
  w8benTaxId: string | null;
  w8benSignedName: string | null;
  w8benSignedAt: string | null;
  status: "pending_review" | "verified" | "rejected";
  adminNotes: string | null;
  reviewedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SWIFT_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

function sqlConnection() {
  if (!process.env.DATABASE_URL) {
    throw new OnboardingError("Payout profile service is unavailable", 503);
  }
  return neon(process.env.DATABASE_URL);
}

async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await sqlConnection().query(text, values)) as T[];
}

export function maskAccountNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length <= 4) return "••••";
  return "•••• " + trimmed.slice(-4);
}

function cleanText(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new OnboardingError(`${label} is required (${min}–${max} characters)`);
  }
  return value.trim();
}

function optionalText(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new OnboardingError(`${label} must be ${max} characters or fewer`);
  }
  return value.trim() || null;
}

export function validatePayoutProfileInput(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new OnboardingError("Payout profile details are required");
  }
  const body = input as Record<string, unknown>;
  const listingId = body.listingId;
  assertListingId(listingId);

  const method = typeof body.payoutMethod === "string" ? body.payoutMethod.trim().toLowerCase() : "";
  if (!ALLOWED_PAYOUT_METHODS.includes(method as PayoutMethod)) {
    throw new OnboardingError("Choose PayPal, Wise, or Bank Wire (SWIFT / Local)");
  }
  const payoutMethod = method as PayoutMethod;

  const currencyRaw = typeof body.payoutCurrency === "string" ? body.payoutCurrency.trim().toUpperCase() : "USD";
  if (!ALLOWED_PAYOUT_CURRENCIES.includes(currencyRaw as PayoutCurrency)) {
    throw new OnboardingError("Unsupported payout currency");
  }
  const payoutCurrency = currencyRaw as PayoutCurrency;

  let paypalEmail: string | null = null;
  let wiseRecipientEmail: string | null = null;
  let wiseAccountId: string | null = null;
  let bankName: string | null = null;
  let bankCountry: string | null = null;
  let bankAccountHolder: string | null = null;
  let bankAccountNumber: string | null = null;
  let bankSwiftBic: string | null = null;
  let bankRoutingOrBranch: string | null = null;
  let intermediaryBankSwift: string | null = null;

  if (payoutMethod === "paypal") {
    paypalEmail = cleanText(body.paypalEmail, 5, 320, "PayPal account email").toLowerCase();
    if (!EMAIL_RE.test(paypalEmail)) {
      throw new OnboardingError("Enter a valid PayPal email address");
    }
  } else if (payoutMethod === "wise") {
    wiseRecipientEmail = cleanText(body.wiseRecipientEmail, 5, 320, "Wise account email").toLowerCase();
    if (!EMAIL_RE.test(wiseRecipientEmail)) {
      throw new OnboardingError("Enter a valid Wise recipient email address");
    }
    wiseAccountId = optionalText(body.wiseAccountId, 128, "Wise account or tag");
  } else if (payoutMethod === "bank_wire") {
    bankName = cleanText(body.bankName, 2, 256, "Bank name");
    const country = cleanText(body.bankCountry, 2, 2, "Bank country").toUpperCase();
    if (!isCountryCode(country)) {
      throw new OnboardingError("Select a valid bank country or territory");
    }
    bankCountry = country;
    bankAccountHolder = cleanText(body.bankAccountHolder, 2, 256, "Account holder legal name");
    bankAccountNumber = cleanText(body.bankAccountNumber, 4, 128, "Account number or IBAN").replace(/\s+/g, "");
    const swift = cleanText(body.bankSwiftBic, 8, 11, "SWIFT / BIC code").toUpperCase().replace(/\s+/g, "");
    if (!SWIFT_RE.test(swift)) {
      throw new OnboardingError("Enter a valid 8- or 11-character SWIFT / BIC code (e.g. RBTTGDGD)");
    }
    bankSwiftBic = swift;
    bankRoutingOrBranch = optionalText(body.bankRoutingOrBranch, 128, "Branch code / transit / routing number");
    const intermediaryRaw = optionalText(body.intermediaryBankSwift, 32, "Intermediary USD bank SWIFT");
    if (intermediaryRaw) {
      const normalizedIntermediary = intermediaryRaw.toUpperCase().replace(/\s+/g, "");
      if (!SWIFT_RE.test(normalizedIntermediary)) {
        throw new OnboardingError("Intermediary bank SWIFT must be a valid 8- or 11-character SWIFT / BIC code");
      }
      intermediaryBankSwift = normalizedIntermediary;
    }
  }

  const minRaw = body.minimumPayoutUsd === undefined || body.minimumPayoutUsd === "" ? 50 : Number(body.minimumPayoutUsd);
  if (!Number.isFinite(minRaw) || minRaw < 10 || minRaw > 10000) {
    throw new OnboardingError("Minimum payout threshold must be between $10 and $10,000 USD");
  }
  const minimumPayoutUsd = Math.round(minRaw * 100) / 100;

  if (body.w8benCertified !== true) {
    throw new OnboardingError("You must certify Foreign Status (Form W-8BEN / W-8BEN-E) for non-US Caribbean & international payouts");
  }
  const w8benBeneficialOwner = cleanText(body.w8benBeneficialOwner, 2, 256, "Beneficial owner legal name");
  const w8benCountry = cleanText(body.w8benCountry, 2, 2, "Country of tax residence / incorporation").toUpperCase();
  if (!isCountryCode(w8benCountry) || w8benCountry === "US") {
    throw new OnboardingError("Form W-8BEN certification requires a non-US country of tax residence or incorporation");
  }
  const w8benTaxId = optionalText(body.w8benTaxId, 128, "Foreign tax identifying number (FTIN)");
  const w8benSignedName = cleanText(body.w8benSignedName, 2, 256, "Electronic signature (full legal name)");

  return {
    listingId,
    payoutMethod,
    payoutCurrency,
    paypalEmail,
    wiseRecipientEmail,
    wiseAccountId,
    bankName,
    bankCountry,
    bankAccountHolder,
    bankAccountNumber,
    bankSwiftBic,
    bankRoutingOrBranch,
    intermediaryBankSwift,
    minimumPayoutUsd,
    w8benCertified: true,
    w8benBeneficialOwner,
    w8benCountry,
    w8benTaxId,
    w8benSignedName,
  };
}

export async function getOperatorPayoutListings(operatorId: string) {
  const rows = await query<{
    listing_id: string;
    listing_title: string;
    island_name: string;
    listing_status: string;
    business_legal_name: string | null;
    business_country: string | null;
    representative_name: string | null;
    stripe_account_id: string | null;
    claim_verified: boolean;
    profile_id: string | null;
    payout_method: PayoutMethod | null;
    payout_currency: PayoutCurrency | null;
    paypal_email: string | null;
    wise_recipient_email: string | null;
    wise_account_id: string | null;
    bank_name: string | null;
    bank_country: string | null;
    bank_account_holder: string | null;
    bank_account_number: string | null;
    bank_swift_bic: string | null;
    bank_routing_or_branch: string | null;
    intermediary_bank_swift: string | null;
    minimum_payout_usd: string | null;
    w8ben_certified: boolean | null;
    w8ben_beneficial_owner: string | null;
    w8ben_country: string | null;
    w8ben_tax_id: string | null;
    w8ben_signed_name: string | null;
    w8ben_signed_at: string | null;
    profile_status: "pending_review" | "verified" | "rejected" | null;
    admin_notes: string | null;
    reviewed_at: string | null;
    revoked_at: string | null;
    updated_at: string | null;
  }>(
    `SELECT l.id AS listing_id, l.title AS listing_title, i.name AS island_name, l.status AS listing_status,
            n.business_legal_name, n.business_country, n.representative_name, n.stripe_account_id,
            vakaygo_listing_claim_verified(l.id) AS claim_verified,
            p.id AS profile_id, p.payout_method, p.payout_currency,
            p.paypal_email, p.wise_recipient_email, p.wise_account_id,
            p.bank_name, p.bank_country, p.bank_account_holder, p.bank_account_number,
            p.bank_swift_bic, p.bank_routing_or_branch, p.intermediary_bank_swift,
            p.minimum_payout_usd, p.w8ben_certified, p.w8ben_beneficial_owner,
            p.w8ben_country, p.w8ben_tax_id, p.w8ben_signed_name, p.w8ben_signed_at,
            p.status AS profile_status, p.admin_notes, p.reviewed_at, p.revoked_at, p.updated_at
       FROM listings l
       JOIN islands i ON i.id = l.island_id
       LEFT JOIN listing_onboarding n ON n.listing_id = l.id AND n.operator_id = l.operator_id
       LEFT JOIN operator_payout_profiles p ON p.listing_id = l.id AND p.operator_id = l.operator_id
      WHERE l.operator_id = $1
      ORDER BY l.created_at DESC`,
    [operatorId]
  );

  return rows.map((row) => ({
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    islandName: row.island_name,
    listingStatus: row.listing_status,
    claimVerified: row.claim_verified === true,
    businessLegalName: row.business_legal_name || "",
    businessCountry: row.business_country || "",
    representativeName: row.representative_name || "",
    stripeConnected: !!row.stripe_account_id,
    payoutProfile: row.profile_id
      ? {
          id: row.profile_id,
          listingId: row.listing_id,
          listingTitle: row.listing_title,
          islandName: row.island_name,
          operatorId,
          payoutMethod: row.payout_method!,
          payoutCurrency: row.payout_currency || "USD",
          paypalEmail: row.paypal_email,
          wiseRecipientEmail: row.wise_recipient_email,
          wiseAccountId: row.wise_account_id,
          bankName: row.bank_name,
          bankCountry: row.bank_country,
          bankAccountHolder: row.bank_account_holder,
          bankAccountNumberMasked: maskAccountNumber(row.bank_account_number),
          bankSwiftBic: row.bank_swift_bic,
          bankRoutingOrBranch: row.bank_routing_or_branch,
          intermediaryBankSwift: row.intermediary_bank_swift,
          minimumPayoutUsd: parseFloat(row.minimum_payout_usd || "50"),
          w8benCertified: row.w8ben_certified === true,
          w8benBeneficialOwner: row.w8ben_beneficial_owner,
          w8benCountry: row.w8ben_country,
          w8benTaxId: row.w8ben_tax_id,
          w8benSignedName: row.w8ben_signed_name,
          w8benSignedAt: row.w8ben_signed_at,
          status: row.profile_status || "pending_review",
          adminNotes: row.admin_notes,
          reviewedAt: row.reviewed_at,
          revokedAt: row.revoked_at,
          updatedAt: row.updated_at || new Date().toISOString(),
        }
      : null,
  }));
}

export async function upsertOperatorPayoutProfile(operatorId: string, rawInput: unknown) {
  const input = validatePayoutProfileInput(rawInput);

  const [owned] = await query<{
    listing_id: string;
    claim_verified: boolean;
    stripe_account_id: string | null;
    business_legal_name: string | null;
  }>(
    `SELECT l.id AS listing_id,
            vakaygo_listing_claim_verified(l.id) AS claim_verified,
            n.stripe_account_id,
            n.business_legal_name
       FROM listings l
       LEFT JOIN listing_onboarding n ON n.listing_id = l.id AND n.operator_id = l.operator_id
      WHERE l.id = $1 AND l.operator_id = $2`,
    [input.listingId, operatorId]
  );

  if (!owned) {
    throw new OnboardingError("You do not own this listing", 403);
  }
  if (!owned.claim_verified) {
    throw new OnboardingError("Verify your business claim before submitting payout details", 409);
  }
  if (owned.stripe_account_id) {
    throw new OnboardingError("This listing already uses a connected Stripe account for direct payouts", 409);
  }

  // Updating payout details resets verification to pending_review and clears activation
  // until compliance review approves the updated payout profile.
  await query(
    `UPDATE listing_onboarding
        SET activated_at = NULL, updated_at = now()
      WHERE listing_id = $1 AND operator_id = $2`,
    [input.listingId, operatorId]
  );

  await query(
    `INSERT INTO operator_payout_profiles (
       listing_id, operator_id, payout_method, payout_currency,
       paypal_email, wise_recipient_email, wise_account_id,
       bank_name, bank_country, bank_account_holder, bank_account_number,
       bank_swift_bic, bank_routing_or_branch, intermediary_bank_swift,
       minimum_payout_usd, w8ben_certified, w8ben_beneficial_owner,
       w8ben_country, w8ben_tax_id, w8ben_signed_name, w8ben_signed_at,
       status, reviewed_by, reviewed_at, revoked_at, admin_notes, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7,
       $8, $9, $10, $11,
       $12, $13, $14,
       $15, $16, $17,
       $18, $19, $20, now(),
       'pending_review', NULL, NULL, NULL, NULL, now()
     )
     ON CONFLICT (listing_id) DO UPDATE SET
       operator_id = EXCLUDED.operator_id,
       payout_method = EXCLUDED.payout_method,
       payout_currency = EXCLUDED.payout_currency,
       paypal_email = EXCLUDED.paypal_email,
       wise_recipient_email = EXCLUDED.wise_recipient_email,
       wise_account_id = EXCLUDED.wise_account_id,
       bank_name = EXCLUDED.bank_name,
       bank_country = EXCLUDED.bank_country,
       bank_account_holder = EXCLUDED.bank_account_holder,
       bank_account_number = EXCLUDED.bank_account_number,
       bank_swift_bic = EXCLUDED.bank_swift_bic,
       bank_routing_or_branch = EXCLUDED.bank_routing_or_branch,
       intermediary_bank_swift = EXCLUDED.intermediary_bank_swift,
       minimum_payout_usd = EXCLUDED.minimum_payout_usd,
       w8ben_certified = EXCLUDED.w8ben_certified,
       w8ben_beneficial_owner = EXCLUDED.w8ben_beneficial_owner,
       w8ben_country = EXCLUDED.w8ben_country,
       w8ben_tax_id = EXCLUDED.w8ben_tax_id,
       w8ben_signed_name = EXCLUDED.w8ben_signed_name,
       w8ben_signed_at = now(),
       status = 'pending_review',
       reviewed_by = NULL,
       reviewed_at = NULL,
       revoked_at = NULL,
       admin_notes = NULL,
       updated_at = now()`,
    [
      input.listingId,
      operatorId,
      input.payoutMethod,
      input.payoutCurrency,
      input.paypalEmail,
      input.wiseRecipientEmail,
      input.wiseAccountId,
      input.bankName,
      input.bankCountry,
      input.bankAccountHolder,
      input.bankAccountNumber,
      input.bankSwiftBic,
      input.bankRoutingOrBranch,
      input.intermediaryBankSwift,
      input.minimumPayoutUsd,
      input.w8benCertified,
      input.w8benBeneficialOwner,
      input.w8benCountry,
      input.w8benTaxId,
      input.w8benSignedName,
    ]
  );

  // Ensure the listing has future availability rows so the operator does not get blocked on setup validation
  await query(
    `INSERT INTO availability (listing_id, date, spots, spots_remaining, is_blocked)
     SELECT l.id, (current_date + offs * interval '1 day')::timestamp,
            GREATEST(1, coalesce(l.max_guests, CASE WHEN l.type IN ('stay','car') THEN 1 ELSE 10 END)),
            GREATEST(1, coalesce(l.max_guests, CASE WHEN l.type IN ('stay','car') THEN 1 ELSE 10 END)),
            false
       FROM listings l
       CROSS JOIN generate_series(0, 89) AS offs
      WHERE l.id = $1
        AND NOT EXISTS (
          SELECT 1 FROM availability a
           WHERE a.listing_id = l.id AND a.date >= current_date AND a.is_blocked = false AND a.spots > 0
        )`,
    [input.listingId]
  ).catch(() => {});

  await expireListingPendingCheckouts(input.listingId);
  await revalidateListing(input.listingId);

  const listings = await getOperatorPayoutListings(operatorId);
  const matched = listings.find((item) => item.listingId === input.listingId) || null;

  if (matched) {
    import("@/server/mail-client")
      .then(({ sendEmail }) =>
        sendEmail({
          from: "VakayGo <hello@vakaygo.com>",
          to: "support@vakaygo.com",
          subject: `[Payout Profile Review] ${matched.listingTitle} (${input.payoutMethod.toUpperCase()} · ${input.payoutCurrency})`,
          html: `<p>Operator submitted a payout profile for <strong>${matched.listingTitle}</strong> (${matched.islandName}).</p>
<ul>
  <li><strong>Method:</strong> ${input.payoutMethod.toUpperCase()} (${input.payoutCurrency})</li>
  <li><strong>W-8BEN Owner:</strong> ${input.w8benBeneficialOwner} (${input.w8benCountry})</li>
</ul>
<p><a href="https://vakaygo.com/admin/payout-profiles">Review &amp; Verify in Admin Dashboard</a></p>`,
        })
      )
      .catch(() => {});
  }

  return matched;
}
