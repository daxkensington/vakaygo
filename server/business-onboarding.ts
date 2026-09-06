import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import twilio from "twilio";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/admin-auth";
import { createConnectAccount, createAccountLink, getAccountStatus } from "@/server/stripe";
import { expireListingPendingCheckouts } from "@/server/booking-checkout-safety";
import { revalidateListing } from "@/lib/revalidate-listing";
import { isCountryCode } from "@/lib/countries";

export const OPERATOR_TERMS_VERSION = "2026-09-06";
export const PROVIDER_READINESS_TTL_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OnboardingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function assertListingId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new OnboardingError("A valid listing ID is required");
}
function connection() {
  if (!process.env.DATABASE_URL) throw new OnboardingError("Business onboarding is unavailable", 503);
  return neon(process.env.DATABASE_URL);
}
async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
  return await connection().query(text, values) as T[];
}
export function onboardingErrorResponse(error: unknown) {
  if (error instanceof OnboardingError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "";
  const expected = message.match(/VG_ONBOARDING:([^\n]+)/)?.[1];
  return NextResponse.json({ error: expected || "Business onboarding is temporarily unavailable" }, { status: expected ? 409 : 503 });
}
export async function requireCurrentOperator() {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const [user] = await query<{ id: string; role: string; email: string; name: string | null }>(
    "SELECT id,role,email,name FROM users WHERE id=$1 AND email_verified=true AND role IN ('operator','admin')", [auth.userId]);
  if (!user) return { ok: false as const, error: NextResponse.json({ error: "Business account required" }, { status: 403 }) };
  return { ok: true as const, userId: user.id, role: user.role, email: user.email, name: user.name };
}
export function stripeEnvironment(): "test" | "live" | null {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return null;
}
function allowedCountries() {
  return (process.env.STRIPE_CONNECT_COUNTRIES || "").split(",").map(c => c.trim().toUpperCase()).filter(isCountryCode);
}
type Onboarding = {
  listing_id: string; operator_id: string; verified_claim_id: string;
  business_legal_name: string | null; business_country: string | null; business_address: string | null;
  representative_name: string | null; authority_accepted_at: string | null; terms_version: string | null; terms_accepted_at: string | null;
  stripe_account_id: string | null; provider_environment: string | null; platform_account_id: string | null;
  provider_country: string | null; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean;
  card_payments_active: boolean; transfers_active: boolean; provider_checked_at: string | null;
  provider_version: number; provider_revoked_at: string | null; connect_attempt_id: string;
  activated_at: string | null; suspended_at: string | null;
};
type Context = {
  listing_id: string; operator_id: string; title: string; slug: string; island_slug: string; listing_status: string;
  onboarding: Onboarding | null; claim_valid: boolean; listing_valid: boolean; db_bookable: boolean; launch_enabled: boolean;
  config_environment: string | null; config_platform: string | null; config_countries: string[];
};
async function context(listingId: string): Promise<Context | undefined> {
  const [row] = await query<Context>(`SELECT l.id listing_id,l.operator_id,l.title,l.slug,i.slug island_slug,l.status listing_status,
   row_to_json(n) onboarding,
   EXISTS(SELECT 1 FROM listing_claim_verifications v
     JOIN listing_claims cl ON cl.id=v.claim_id AND cl.listing_id=l.id AND cl.operator_id=l.operator_id AND cl.status='approved'
     JOIN listing_trusted_contacts tc ON tc.listing_id=l.id AND tc.phone=v.target_phone
     WHERE v.id=n.verified_claim_id AND v.listing_id=l.id
     AND v.operator_id=l.operator_id AND n.operator_id=l.operator_id AND v.status='verified' AND v.verified_at IS NOT NULL
     AND v.provider_approved_at IS NOT NULL AND v.provider_verification_id IS NOT NULL AND v.revoked_at IS NULL) claim_valid,
   vakaygo_listing_setup_valid(l.id) listing_valid,vakaygo_listing_bookable(l.id) db_bookable,
   coalesce((SELECT enabled FROM feature_flags WHERE key='booking_launch_enabled'),false) launch_enabled,
   c.environment config_environment,c.platform_account_id config_platform,c.allowed_countries config_countries
   FROM listings l JOIN islands i ON i.id=l.island_id LEFT JOIN listing_onboarding n ON n.listing_id=l.id
   LEFT JOIN booking_provider_config c ON c.id=true WHERE l.id=$1`, [listingId]);
  return row;
}
function deploymentMatchesConfiguration(environment: unknown, platform: unknown, countries: unknown): boolean {
  const deploymentEnvironment = stripeEnvironment();
  const deploymentPlatform = process.env.STRIPE_PLATFORM_ACCOUNT_ID || "";
  const configuredCountries = (process.env.STRIPE_CONNECT_COUNTRIES || "").split(",").map(value => value.trim().toUpperCase()).filter(Boolean);
  if (!deploymentEnvironment || !/^acct_[A-Za-z0-9]+$/.test(deploymentPlatform) || !configuredCountries.length
    || configuredCountries.some(country => !isCountryCode(country))
    || environment !== deploymentEnvironment || platform !== deploymentPlatform
    || !Array.isArray(countries) || !countries.length
    || countries.some(country => !isCountryCode(country))) return false;
  const deploymentCountries = [...new Set(configuredCountries)].sort();
  const databaseCountries = [...new Set(countries as string[])].sort();
  return databaseCountries.length === deploymentCountries.length &&
    databaseCountries.every((country, index) => country === deploymentCountries[index]);
}
function providerMatches(ctx: Context) {
  const n = ctx.onboarding;
  const environment = stripeEnvironment();
  const platform = process.env.STRIPE_PLATFORM_ACCOUNT_ID;
  return deploymentMatchesConfiguration(ctx.config_environment, ctx.config_platform, ctx.config_countries)
    && !!n && !!environment && !!platform && n.provider_environment === environment && n.platform_account_id === platform
    && ctx.config_environment === environment && ctx.config_platform === platform
    && !!n.business_country && allowedCountries().includes(n.business_country)
    && Array.isArray(ctx.config_countries) && ctx.config_countries.includes(n.business_country)
    && n.provider_country === n.business_country && !n.provider_revoked_at;
}
function paymentReady(ctx: Context) {
  const n = ctx.onboarding;
  return !!n && providerMatches(ctx) && !!n.stripe_account_id && n.charges_enabled && n.payouts_enabled
    && n.details_submitted && n.card_payments_active && n.transfers_active
    && !!n.provider_checked_at && Date.parse(n.provider_checked_at) <= Date.now()
    && Date.now() - Date.parse(n.provider_checked_at) < PROVIDER_READINESS_TTL_MS;
}
function requirements(ctx: Context) {
  const n = ctx.onboarding;
  return {
    claim: ctx.claim_valid,
    business: !!n && (n.business_legal_name?.trim().length || 0) >= 2 && isCountryCode(n.business_country) && (n.business_address?.trim().length || 0) >= 8,
    representative: !!n?.authority_accepted_at && (n.representative_name?.trim().length || 0) >= 2,
    terms: n?.terms_version === OPERATOR_TERMS_VERSION && !!n.terms_accepted_at,
    listing: ctx.listing_valid,
    payments: paymentReady(ctx),
    activation: !!n?.activated_at && !n.suspended_at,
  };
}
function reasonFor(ctx: Context): string {
  const r = requirements(ctx);
  if (!r.claim) return "unclaimed";
  if (ctx.onboarding?.suspended_at) return "suspended";
  if (!r.business || !r.representative || !r.terms) return "onboarding_incomplete";
  if (!r.listing || ctx.listing_status !== "active") return "listing_incomplete";
  if (!r.payments) return ctx.onboarding?.provider_checked_at && providerMatches(ctx)
    && Date.now() - Date.parse(ctx.onboarding.provider_checked_at) >= PROVIDER_READINESS_TTL_MS ? "payments_stale" : "payments_unavailable";
  if (!r.activation) return "not_activated";
  if (process.env.BOOKINGS_ENABLED !== "true" || !ctx.launch_enabled) return "bookings_disabled";
  return ctx.db_bookable ? "ready" : "onboarding_incomplete";
}
export async function bookingLaunchEnabled(): Promise<boolean> {
  if (process.env.BOOKINGS_ENABLED !== "true") return false;
  try {
    const [row] = await query<{
      enabled: boolean; environment: string | null; platform_account_id: string | null; allowed_countries: unknown;
    }>(`SELECT f.enabled,c.environment,c.platform_account_id,c.allowed_countries
      FROM booking_provider_config c JOIN feature_flags f ON f.key='booking_launch_enabled' WHERE c.id=true`);
    return row?.enabled === true && deploymentMatchesConfiguration(row.environment, row.platform_account_id, row.allowed_countries);
  } catch { return false; }
}
export async function getListingBookingEligibility(listingId: string, options: { refreshProvider?: boolean } = {}): Promise<{
  eligible: boolean; reason: string; operatorId: string | null; stripeAccountId: string | null;
}> {
  const closed = { eligible: false, reason: "bookings_disabled", operatorId: null, stripeAccountId: null };
  if (!UUID.test(listingId)) return { ...closed, reason: "not_found" };
  try {
    if (options.refreshProvider && process.env.BOOKINGS_ENABLED === "true") await refreshListingPaymentReadiness(listingId);
    const ctx = await context(listingId);
    if (!ctx) return { ...closed, reason: "not_found" };
    const reason = reasonFor(ctx);
    return { eligible: reason === "ready", reason, operatorId: ctx.operator_id, stripeAccountId: ctx.onboarding?.stripe_account_id || null };
  } catch { return closed; }
}
async function ownedContext(listingId: string, operatorId: string) {
  assertListingId(listingId);
  const ctx = await context(listingId);
  if (!ctx) throw new OnboardingError("Listing not found", 404);
  if (ctx.operator_id !== operatorId) throw new OnboardingError("You do not own this listing", 403);
  return ctx;
}
export async function getOnboardingStatus(listingId: string, operatorId: string, refresh = false) {
  await ownedContext(listingId, operatorId);
  if (refresh) await refreshListingPaymentReadiness(listingId);
  const ctx = await ownedContext(listingId, operatorId);
  const n = ctx.onboarding;
  const reason = reasonFor(ctx);
  const r = requirements(ctx);
  return {
    listingId, listing: { title: ctx.title, slug: ctx.slug, islandSlug: ctx.island_slug }, canManage: true,
    state: reason === "ready" ? "ready" : !r.claim ? "unclaimed" : !r.business || !r.terms || !r.representative ? "onboarding_incomplete" : "onboarding_pending",
    eligible: reason === "ready", reason, requirements: r,
    bookingsEnabled: process.env.BOOKINGS_ENABLED === "true" && ctx.launch_enabled && deploymentMatchesConfiguration(ctx.config_environment, ctx.config_platform, ctx.config_countries),
    business: { legalName: n?.business_legal_name || "", country: n?.business_country || "", address: n?.business_address || "", representativeName: n?.representative_name || "" },
    termsVersion: OPERATOR_TERMS_VERSION,
    allowedPaymentCountries: deploymentMatchesConfiguration(ctx.config_environment, ctx.config_platform, ctx.config_countries)
      ? [...new Set(allowedCountries())] : [],
    stripe: { connected: !!n?.stripe_account_id, chargesEnabled: n?.charges_enabled || false, payoutsEnabled: n?.payouts_enabled || false,
      detailsSubmitted: n?.details_submitted || false, cardPaymentsActive: n?.card_payments_active || false, transfersActive: n?.transfers_active || false,
      checkedAt: n?.provider_checked_at || null },
    activatedAt: n?.activated_at || null,
  };
}
function boundedText(value: unknown, minimum: number, maximum: number, label: string) {
  if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) throw new OnboardingError(label + " is required");
  return value.trim();
}
export async function saveOnboarding(listingId: string, operatorId: string, input: unknown) {
  const ctx = await ownedContext(listingId, operatorId);
  if (!ctx.claim_valid || !ctx.onboarding) throw new OnboardingError("Verify the business claim before onboarding", 409);
  const body = input as { business?: Record<string, unknown>; authorityAccepted?: unknown; termsAccepted?: unknown; termsVersion?: unknown };
  if (!body || typeof body !== "object" || !body.business) throw new OnboardingError("Business details are required");
  const legalName = boundedText(body.business.legalName, 2, 256, "Legal business name");
  const country = boundedText(body.business.country, 2, 2, "Actual business country").toUpperCase();
  if (!isCountryCode(country)) throw new OnboardingError("Choose the actual country or territory where your company is registered");
  const address = boundedText(body.business.address, 8, 2000, "Business address");
  const representative = boundedText(body.business.representativeName, 2, 256, "Representative name");
  if (body.authorityAccepted !== true || body.termsAccepted !== true || body.termsVersion !== OPERATOR_TERMS_VERSION)
    throw new OnboardingError("Confirm your authority and accept the current operator terms");
  if (ctx.onboarding.stripe_account_id && ctx.onboarding.business_country !== country)
    throw new OnboardingError("The payment account country cannot be changed; contact support for a new verified business account", 409);
  const rows = await query(`UPDATE listing_onboarding n SET business_legal_name=$3,business_country=$4,business_address=$5,
    representative_name=$6,authority_accepted_at=now(),terms_version=$7,terms_accepted_at=now(),
    activated_at=NULL,provider_checked_at=NULL,provider_version=provider_version+1,
    connect_attempt_id=CASE WHEN stripe_account_id IS NULL THEN gen_random_uuid() ELSE connect_attempt_id END,updated_at=now()
    WHERE n.listing_id=$1 AND n.operator_id=$2 AND EXISTS(SELECT 1 FROM listings l WHERE l.id=n.listing_id AND l.operator_id=$2)
    RETURNING listing_id`, [listingId, operatorId, legalName, country, address, representative, OPERATOR_TERMS_VERSION]);
  if (!rows.length) throw new OnboardingError("Ownership changed; reload onboarding", 409);
  await expireListingPendingCheckouts(listingId);
  await revalidateListing(listingId);
  return getOnboardingStatus(listingId, operatorId);
}
export async function refreshListingPaymentReadiness(listingId: string): Promise<void> {
  assertListingId(listingId);
  const ctx = await context(listingId);
  const n = ctx?.onboarding;
  if (!ctx || !n || !n.stripe_account_id || n.provider_revoked_at) return;
  let healthy = false;
  let country: string | null = null;
  let flags = { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, cardPaymentsActive: false, transfersActive: false };
  try {
    const status = await getAccountStatus(n.stripe_account_id);
    country = status.country;
    const binding = deploymentMatchesConfiguration(ctx.config_environment, ctx.config_platform, ctx.config_countries)
      && status.accountId === n.stripe_account_id && status.operatorId === n.operator_id && status.listingId === listingId
      && status.platformAccountId === process.env.STRIPE_PLATFORM_ACCOUNT_ID && n.platform_account_id === status.platformAccountId
      && n.provider_environment === stripeEnvironment() && ctx.config_platform === status.platformAccountId
      && ctx.config_environment === stripeEnvironment() && !!country && country === n.business_country
      && allowedCountries().includes(country) && ctx.config_countries?.includes(country) && ctx.claim_valid;
    if (binding) flags = status;
    healthy = !!binding && status.chargesEnabled && status.payoutsEnabled && status.detailsSubmitted
      && status.cardPaymentsActive && status.transfersActive && !status.disabledReason;
  } catch { /* Provider failures always close eligibility; no provider payloads or secrets are logged. */ }
  const updated = await query(`UPDATE listing_onboarding SET charges_enabled=$4,payouts_enabled=$5,details_submitted=$6,
   card_payments_active=$7,transfers_active=$8,provider_country=$9,provider_checked_at=CASE WHEN $10 THEN now() ELSE NULL END,
   activated_at=CASE WHEN $10 THEN activated_at ELSE NULL END,provider_version=provider_version+1,updated_at=now()
   WHERE listing_id=$1 AND stripe_account_id=$2 AND provider_version=$3 AND provider_revoked_at IS NULL RETURNING listing_id`,
   [listingId,n.stripe_account_id,n.provider_version,flags.chargesEnabled,flags.payoutsEnabled,flags.detailsSubmitted,
    flags.cardPaymentsActive,flags.transfersActive,country,healthy]);
  if (updated.length) {
    if (!healthy) await expireListingPendingCheckouts(listingId);
    await revalidateListing(listingId);
  }
}
export async function invalidateStripeAccountReadiness(accountId: string): Promise<void> {
  await query(`UPDATE listing_onboarding SET provider_version=provider_version+1,provider_checked_at=NULL,
    charges_enabled=false,payouts_enabled=false,card_payments_active=false,transfers_active=false,updated_at=now()
    WHERE stripe_account_id=$1`, [accountId]);
}
export async function revokeStripeAccountReadiness(accountId: string): Promise<void> {
  const rows = await query<{ listing_id: string }>(`UPDATE listing_onboarding SET provider_version=provider_version+1,
   provider_revoked_at=coalesce(provider_revoked_at,now()),provider_checked_at=NULL,activated_at=NULL,
   charges_enabled=false,payouts_enabled=false,card_payments_active=false,transfers_active=false,updated_at=now()
   WHERE stripe_account_id=$1 RETURNING listing_id`, [accountId]);
  for (const row of rows) { await expireListingPendingCheckouts(row.listing_id); await revalidateListing(row.listing_id); }
}
export async function refreshStripeAccountReadiness(accountId: string): Promise<void> {
  const rows = await query<{ listing_id: string }>("SELECT listing_id FROM listing_onboarding WHERE stripe_account_id=$1 AND provider_revoked_at IS NULL", [accountId]);
  for (const row of rows) await refreshListingPaymentReadiness(row.listing_id);
}
export async function activateOnboarding(listingId: string, operatorId: string) {
  await ownedContext(listingId, operatorId);
  await refreshListingPaymentReadiness(listingId);
  // The database function uses locks shared with the booking trigger.
  const [result] = await query<{ activated: boolean }>("SELECT vakaygo_activate_listing($1,$2) activated", [listingId, operatorId]);
  if (!result?.activated) throw new OnboardingError("Complete every onboarding requirement before activating", 409);
  await revalidateListing(listingId);
  return getOnboardingStatus(listingId, operatorId);
}
export async function connectOnboarding(listingId: string, operatorId: string, email: string) {
  const ctx = await ownedContext(listingId, operatorId);
  const n = ctx.onboarding;
  const r = requirements(ctx);
  if (!n || !r.claim || !r.business || !r.representative || !r.terms) throw new OnboardingError("Complete verified business details first", 409);
  const country = n.business_country!;
  const environment = stripeEnvironment();
  const platform = process.env.STRIPE_PLATFORM_ACCOUNT_ID;
  if (!environment || !platform || !deploymentMatchesConfiguration(ctx.config_environment, ctx.config_platform, ctx.config_countries)
    || !allowedCountries().includes(country))
    throw new OnboardingError("Payment onboarding is not enabled for this business country", 409);
  if (n.provider_revoked_at || n.suspended_at) throw new OnboardingError("Payment account requires support review", 409);
  const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) throw new OnboardingError("Application return URL is not configured", 503);
  const url = new URL(origin);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost"))
    throw new OnboardingError("Application return URL is invalid", 503);
  let accountId = n.stripe_account_id;
  if (!accountId) {
    const account = await createConnectAccount({ email, businessName: n.business_legal_name!, country, operatorId, listingId,
      idempotencyKey: "vakaygo-connect-" + n.connect_attempt_id + "-" + platform + "-" + environment });
    const saved = await query(`UPDATE listing_onboarding n SET stripe_account_id=$3,provider_environment=$4,platform_account_id=$5,
      provider_version=provider_version+1,provider_checked_at=NULL,activated_at=NULL,updated_at=now()
      WHERE listing_id=$1 AND operator_id=$2 AND stripe_account_id IS NULL AND connect_attempt_id=$6
       AND business_country=$7 AND provider_version=$8 AND provider_revoked_at IS NULL
       AND EXISTS(SELECT 1 FROM listings l WHERE l.id=n.listing_id AND l.operator_id=$2)
      RETURNING listing_id`, [listingId,operatorId,account.id,environment,platform,n.connect_attempt_id,country,n.provider_version]);
    if (!saved.length) {
      const current = await ownedContext(listingId,operatorId);
      if (current.onboarding?.stripe_account_id !== account.id) throw new OnboardingError("Business details changed; reload payment onboarding",409);
    }
    accountId = account.id;
  } else if (n.provider_environment !== environment || n.platform_account_id !== platform) {
    throw new OnboardingError("Payment account belongs to a different configured environment",409);
  }
  const path = "/operator/onboarding/" + listingId;
  return { url: await createAccountLink(accountId, { returnUrl: new URL(path + "?stripe=success",url.origin).href,
    refreshUrl: new URL(path + "?stripe=refresh",url.origin).href }) };
}

type ClaimVerification = {
 id: string; listing_id: string; operator_id: string; claim_id: string; target_phone: string; status: string;
 service_sid: string; provider_account_id: string; provider_verification_id: string | null;
 provider_approved_at: string | null; check_token: string | null; expires_at: string;
};
function verifyConfiguration() {
  const account = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  const service = process.env.TWILIO_VERIFY_SERVICE_SID || "";
  if (!/^AC[0-9a-f]{32}$/i.test(account) || !token || !/^VA[0-9a-f]{32}$/i.test(service))
    throw new OnboardingError("Automated verification is unavailable; contact support for review",503);
  return { account, service, client: twilio(account,token) };
}
export async function getClaimStatus(listingId: string, operatorId: string) {
  assertListingId(listingId);
  const [row] = await query<{
    id: string; title: string; type: string; address: string | null; island_name: string; island_slug: string; slug: string;
    unclaimed: boolean; phone: string | null; claim: { id: string; status: string; createdAt: string; adminNotes: string | null } | null;
    verification: ClaimVerification | null;
  }>(`SELECT l.id,l.title,l.type,l.address,i.name island_name,i.slug island_slug,l.slug,t.phone,
   EXISTS(SELECT 1 FROM users u WHERE u.id=l.operator_id AND lower(u.email)='unclaimed@vakaygo.com') unclaimed,
   (SELECT json_build_object('id',c.id,'status',c.status,'createdAt',c.created_at,'adminNotes',c.admin_notes)
    FROM listing_claims c WHERE c.listing_id=l.id AND c.operator_id=$2 ORDER BY c.created_at DESC LIMIT 1) claim,
   (SELECT row_to_json(v) FROM listing_claim_verifications v WHERE v.listing_id=l.id AND v.operator_id=$2 ORDER BY v.created_at DESC LIMIT 1) verification
   FROM listings l JOIN islands i ON i.id=l.island_id LEFT JOIN listing_trusted_contacts t ON t.listing_id=l.id WHERE l.id=$1`,
   [listingId,operatorId]);
  if (!row) throw new OnboardingError("Listing not found",404);
  const v = row.verification;
  let configured = true;
  try { verifyConfiguration(); } catch { configured = false; }
  const expired = !!v && !["verified","revoked"].includes(v.status) && Date.parse(v.expires_at) <= Date.now();
  const phoneHint = row.phone ? "••• ••• " + row.phone.slice(-2) : null;
  return {
    listing: { id: row.id,title: row.title,type: row.type,address: row.address,islandName: row.island_name,
      url: "/" + row.island_slug + "/" + row.slug,unclaimed: row.unclaimed === true,phoneHint },
    claim: row.claim,
    verification: { state: expired ? "expired" : v?.status || "not_started", phoneHint,
      available: row.unclaimed === true && !!row.phone && configured,
      reason: !row.phone ? "trusted_contact_unavailable" : !configured ? "verification_unavailable" : null,
      expiresAt: v?.expires_at || null, channels: ["sms","call"] },
  };
}
export async function startClaimVerification(listingId: string, operatorId: string, channel: "sms" | "call" = "sms") {
  assertListingId(listingId);
  if (channel !== "sms" && channel !== "call") throw new OnboardingError("Choose text message or voice call");
  const provider = verifyConfiguration();
  const [created] = await query<{ id: string }>("SELECT vakaygo_begin_claim($1,$2,$3,$4) id",[listingId,operatorId,provider.service,provider.account]);
  const [v] = await query<ClaimVerification>("SELECT * FROM listing_claim_verifications WHERE id=$1 AND operator_id=$2",[created.id,operatorId]);
  try {
    const result = await provider.client.verify.v2.services(provider.service).verifications.create({ to: v.target_phone,channel });
    if (result.accountSid !== provider.account || result.serviceSid !== provider.service || result.to !== v.target_phone || result.status !== "pending")
      throw new OnboardingError("Verification could not be started",503);
    const saved = await query(`UPDATE listing_claim_verifications SET provider_verification_id=$2,status='pending',updated_at=now()
      WHERE id=$1 AND status='sending' AND expires_at>now() RETURNING id`,[v.id,result.sid]);
    if (!saved.length) throw new OnboardingError("Verification expired; start again",409);
  } catch {
    await query("UPDATE listing_claim_verifications SET status='failed',updated_at=now() WHERE id=$1 AND status='sending'",[v.id]);
    throw new OnboardingError("Unable to send a code to the business contact; contact support or try again later",503);
  }
  return { claim: { id: v.claim_id,status: "pending" },verification: { state: "pending" } };
}
export async function completeClaimVerification(listingId: string, operatorId: string, code: unknown) {
  assertListingId(listingId);
  if (typeof code !== "string" || !/^[0-9]{4,10}$/.test(code)) throw new OnboardingError("Enter the verification code");
  const provider = verifyConfiguration();
  const [previous] = await query<ClaimVerification>(`SELECT * FROM listing_claim_verifications
    WHERE listing_id=$1 AND operator_id=$2 ORDER BY created_at DESC LIMIT 1`,[listingId,operatorId]);
  if (previous?.status === "verified") return { claim: { id: previous.claim_id,status: "approved" },
    verification: { state: "verified" },onboardingUrl: "/operator/onboarding/" + listingId };
  const lease = randomUUID();
  const [v] = await query<ClaimVerification>(`UPDATE listing_claim_verifications SET check_token=$3,
    check_locked_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
    WHERE listing_id=$1 AND operator_id=$2 AND status='pending' AND expires_at>now() AND attempts<5
      AND (check_locked_until IS NULL OR check_locked_until<=now()) RETURNING *`,[listingId,operatorId,lease]);
  if (!v) throw new OnboardingError("Verification expired, busy or attempt limit reached; start again after expiry",409);
  try {
    if (v.service_sid !== provider.service || v.provider_account_id !== provider.account || !v.provider_verification_id)
      throw new OnboardingError("Verification configuration changed; start again after expiry",409);
    if (!v.provider_approved_at) {
      const result = await provider.client.verify.v2.services(provider.service).verificationChecks.create({
        verificationSid: v.provider_verification_id,code,
      });
      if (result.status !== "approved" || result.sid !== v.provider_verification_id || result.to !== v.target_phone
        || result.serviceSid !== v.service_sid || result.accountSid !== v.provider_account_id)
        throw new OnboardingError("The verification code is incorrect",400);
      const persisted = await query(`UPDATE listing_claim_verifications SET provider_approved_at=now(),updated_at=now()
        WHERE id=$1 AND check_token=$2 AND status='pending' AND check_locked_until>now() RETURNING id`,[v.id,lease]);
      if (!persisted.length) throw new OnboardingError("Verification changed; reload this page",409);
    }
    const [claimed] = await query<{ claim_id: string }>("SELECT vakaygo_complete_claim($1,$2,$3) claim_id",[v.id,operatorId,lease]);
    await revalidateListing(listingId);
    return { claim: { id: claimed.claim_id,status: "approved" },verification: { state: "verified" },onboardingUrl: "/operator/onboarding/" + listingId };
  } catch (error) {
    await query("UPDATE listing_claim_verifications SET check_token=NULL,check_locked_until=NULL,updated_at=now() WHERE id=$1 AND check_token=$2 AND status='pending'",[v.id,lease]);
    if (error instanceof OnboardingError) throw error;
    throw new OnboardingError("Unable to verify this code; retry or start again after expiry",409);
  }
}
