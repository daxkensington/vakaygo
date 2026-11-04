// @vitest-environment node
import { randomInt, randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OPERATOR_TERMS_VERSION, PREVIOUS_OPERATOR_TERMS_VERSION } from "@/lib/operator-terms";

const transport = vi.hoisted(() => ({
  travelerId: "", operatorId: "", listingId: "", bookingId: "", sessionId: "", platformId: "", country: "",
  retrieve: vi.fn(), expire: vi.fn(), account: vi.fn(), identity: vi.fn(), create: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-terms-checkout-session" }) }) }));
vi.mock("@/server/session-validation", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/session-validation")>(),
  verifyCurrentSessionToken: async () => ({ userId: transport.travelerId, role: "traveler", email: "terms-checkout-traveler@example.invalid", sessionVersion: 1, emailVerified: true }),
}));
vi.mock("@/server/stripe", () => ({
  retrieveCheckoutSession: transport.retrieve, expireCheckoutSession: transport.expire,
  getAccountStatus: transport.account, verifyStripePlatformIdentity: transport.identity,
  createCheckoutSession: transport.create, createConnectAccount: transport.create, createAccountLink: transport.create,
}));
// Cache invalidation has no Next request context in this isolated route test.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST } from "@/app/api/payments/create-checkout/route";

const enabled = process.env.VAKAYGO_TERMS_DB_TESTS === "true";
const ownerId = randomUUID(), travelerId = randomUUID();
const islandId = randomInt(1_800_000_000, 1_900_000_000);
const slug = `terms-checkout-${randomUUID()}`;
const connectedAccount = "acct_termscheckoutoperator";
const fixtures = {
  destination: { listingId: randomUUID(), claimId: randomUUID(), proofId: randomUUID(), phone: "+12465557801" },
  platform: { listingId: randomUUID(), claimId: randomUUID(), proofId: randomUUID(), phone: "+12465557802" },
};
type Rail = keyof typeof fixtures;
let db: NeonQueryFunction<false, false> | undefined;
let configurationBefore: unknown;
const bookingIds: string[] = [];

async function readConfiguration() {
  return await db!`SELECT to_jsonb(c) AS config,(SELECT to_jsonb(f) FROM feature_flags f WHERE key='booking_launch_enabled') AS launch
    FROM booking_provider_config c WHERE id=true`;
}

async function prepare(rail: Rail, duringRetrieve?: () => Promise<void>) {
  const fixture = fixtures[rail], bookingId = randomUUID(), sessionId = `cs_terms_${randomUUID().replaceAll("-", "")}`;
  bookingIds.push(bookingId);
  Object.assign(transport, { travelerId, operatorId: ownerId, listingId: fixture.listingId, bookingId, sessionId });
  await db!`UPDATE listing_onboarding SET terms_version=${OPERATOR_TERMS_VERSION},terms_accepted_at=now(),authority_accepted_at=now(),
    activated_at=now(),suspended_at=NULL,provider_revoked_at=NULL,provider_checked_at=now(),charges_enabled=true,payouts_enabled=true,
    details_submitted=true,card_payments_active=true,transfers_active=true WHERE listing_id=${fixture.listingId}`;
  expect(await db!`SELECT vakaygo_listing_bookable(${fixture.listingId}::uuid) AS ready`).toEqual([{ ready: true }]);
  await db!`INSERT INTO bookings(id,booking_number,traveler_id,operator_id,listing_id,start_date,guest_count,subtotal,service_fee,total_amount,currency,payment_method)
    VALUES(${bookingId},${`TC-${bookingId.slice(0, 28)}`},${travelerId},${ownerId},${fixture.listingId},current_date+120,1,100,0,100,'USD','card')`;
  await db!`UPDATE bookings SET checkout_session_id=${sessionId},checkout_stripe_account_id=${rail === "destination" ? connectedAccount : transport.platformId},
    payment_mode=${rail},operator_earnings_cents=8500,checkout_expires_at=now()+interval '1 hour' WHERE id=${bookingId}`;
  let sessionStatus = "open", readCount = 0;
  transport.retrieve.mockReset().mockImplementation(async (id: string) => {
    expect(id).toBe(sessionId);
    if (readCount++ === 0) await duringRetrieve?.();
    return { id: sessionId, status: sessionStatus, payment_status: "unpaid", livemode: false, metadata: { bookingId }, url: `https://checkout.stripe.com/${sessionId}` };
  });
  transport.expire.mockReset().mockImplementation(async (id: string) => { expect(id).toBe(sessionId); sessionStatus = "expired"; });
  transport.create.mockReset().mockRejectedValue(new Error("Provider creation is forbidden in reused-session tests"));
  transport.identity.mockReset().mockResolvedValue({ accountId: transport.platformId, environment: "test" });
  transport.account.mockReset().mockImplementation(async (id: string) => {
    expect(id).toBe(connectedAccount);
    return { accountId: connectedAccount, operatorId: ownerId, listingId: fixture.listingId, platformAccountId: transport.platformId,
      country: transport.country, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, cardPaymentsActive: true, transfersActive: true, disabledReason: null };
  });
  const read = async () => (await db!`SELECT status,paid_at,payment_id,cancellation_requested_at,total_amount,currency,operator_earnings_cents,
    payment_mode,checkout_session_id,checkout_stripe_account_id,checkout_expires_at>now() AS checkout_open FROM bookings WHERE id=${bookingId}`)[0];
  const run = () => POST(new Request("https://audit.invalid/api/payments/create-checkout", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId }),
  }));
  return { fixture, bookingId, sessionId, run, read };
}

describe.skipIf(!enabled).sequential("operator terms during reused Checkout against isolated PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || "http://invalid");
    if (process.env.CI !== "true" || process.env.VAKAYGO_TERMS_DB_TESTS !== "true" || process.env.VAKAYGO_CI_DATABASE_PROXY !== "1"
      || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["/vakaygo_test", "/vakaygo_terms"].includes(url.pathname)) {
      throw new Error("Explicit CI terms tests and a loopback disposable PostgreSQL database are required before fixture writes");
    }
    db = neon(process.env.DATABASE_URL!);
    configurationBefore = await readConfiguration();
    const [configuration] = await db`SELECT environment,platform_account_id,allowed_countries,
      (SELECT enabled FROM feature_flags WHERE key='booking_launch_enabled') AS enabled FROM booking_provider_config WHERE id=true`;
    if (configuration?.environment !== "test" || !/^acct_[A-Za-z0-9]+$/.test(configuration.platform_account_id)
      || !Array.isArray(configuration.allowed_countries) || !configuration.allowed_countries.includes("CA") || configuration.enabled !== true) {
      throw new Error("The standard isolated booking fixture must supply an enabled test platform and CA country configuration");
    }
    transport.platformId = configuration.platform_account_id;
    transport.country = "CA";
    vi.stubEnv("BOOKINGS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_terms_checkout");
    vi.stubEnv("STRIPE_PLATFORM_ACCOUNT_ID", transport.platformId);
    vi.stubEnv("STRIPE_CONNECT_COUNTRIES", configuration.allowed_countries.join(","));
    await db`INSERT INTO islands(id,slug,name,country,timezone) VALUES(${islandId},${slug},'Synthetic terms checkout island','Canada','America/Toronto')`;
    await db`INSERT INTO users(id,email,name,role,email_verified) VALUES
      (${ownerId},${`${ownerId}@example.invalid`},'Synthetic terms checkout owner','operator',true),
      (${travelerId},${`${travelerId}@example.invalid`},'Synthetic terms checkout traveler','traveler',true)`;
    for (const [rail, fixture] of Object.entries(fixtures)) {
      await db`INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,cancellation_policy)
        VALUES(${fixture.listingId},${ownerId},${islandId},'tour','Synthetic terms checkout tour',${`${slug}-${rail}`},'active',100,'USD','person',20,'moderate')`;
      await db`INSERT INTO listing_trusted_contacts(listing_id,original_operator_id,phone,source,source_reference)
        VALUES(${fixture.listingId},${ownerId},${fixture.phone},'synthetic','terms-checkout-integration')`;
      await db`INSERT INTO listing_claims(id,listing_id,operator_id,status,contact_name,contact_phone)
        VALUES(${fixture.claimId},${fixture.listingId},${ownerId},'approved','Synthetic owner',${fixture.phone})`;
      await db`INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status,provider_approved_at,verified_at)
        VALUES(${fixture.proofId},${fixture.listingId},${ownerId},${fixture.claimId},${fixture.phone},'VA_terms_checkout','AC_terms_checkout',${`VE_${fixture.proofId}`},'verified',now(),now())`;
      await db`INSERT INTO availability(listing_id,date,spots,spots_remaining,is_blocked) VALUES(${fixture.listingId},current_date+120,20,20,false)`;
      await db`INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id,business_legal_name,business_country,business_address,representative_name,
        authority_accepted_at,terms_version,terms_accepted_at,stripe_account_id,provider_environment,platform_account_id,provider_country,
        charges_enabled,payouts_enabled,details_submitted,card_payments_active,transfers_active,provider_checked_at,activated_at)
        VALUES(${fixture.listingId},${ownerId},${fixture.proofId},'Synthetic terms checkout company','CA','123 Synthetic Terms Checkout Road','Synthetic owner',
          now(),${OPERATOR_TERMS_VERSION},now(),${rail === "destination" ? connectedAccount : null},'test',${transport.platformId},'CA',true,true,true,true,true,now(),now())`;
      if (rail === "platform") await db`INSERT INTO operator_payout_profiles(listing_id,operator_id,payout_method,payout_currency,w8ben_certified,w8ben_signed_at,status)
        VALUES(${fixture.listingId},${ownerId},'wise','USD',true,now(),'verified')`;
    }
  }, 30_000);

  afterAll(async () => {
    try {
      if (!db) return;
      for (const id of bookingIds) {
        await db`DELETE FROM booking_mail_outbox WHERE booking_id=${id}`;
        await db`DELETE FROM bookings WHERE id=${id}`;
      }
      for (const fixture of Object.values(fixtures)) await db`DELETE FROM listings WHERE id=${fixture.listingId} AND operator_id=${ownerId}`;
      await db`DELETE FROM users WHERE id IN (${ownerId},${travelerId})`;
      await db`DELETE FROM islands WHERE id=${islandId} AND slug=${slug}`;
      expect(await readConfiguration()).toEqual(configurationBefore);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30_000);

  for (const rail of ["destination", "platform"] as const) {
    it(`executes the final real SQL reuse guard and returns a healthy ${rail} URL without provider writes`, async () => {
      const test = await prepare(rail), before = await test.read();
      const response = await test.run();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ url: `https://checkout.stripe.com/${test.sessionId}` });
      expect(await test.read()).toEqual(before);
      expect(transport.retrieve).toHaveBeenCalledTimes(1);
      expect(transport.expire).not.toHaveBeenCalled(); expect(transport.create).not.toHaveBeenCalled();
    });

    it(`expires a ${rail} URL when its current terms are revoked during the provider read`, async () => {
      const test = await prepare(rail, async () => {
        await db!`UPDATE listing_onboarding SET terms_version=${PREVIOUS_OPERATOR_TERMS_VERSION} WHERE listing_id=${fixtures[rail].listingId}`;
      });
      const before = await test.read(), response = await test.run();
      expect(response.status).toBe(409); expect((await response.json()).url).toBeUndefined();
      expect(await db!`SELECT vakaygo_listing_bookable(${test.fixture.listingId}::uuid) AS ready`).toEqual([{ ready: false }]);
      expect(await test.read()).toEqual({ ...before, checkout_open: false });
      expect(transport.expire).toHaveBeenCalledExactlyOnceWith(test.sessionId); expect(transport.create).not.toHaveBeenCalled();
    });

    it(`preserves a cancellation racing a ${rail} provider read and refuses its payment URL`, async () => {
      const test = await prepare(rail, async () => {
        await db!`UPDATE bookings SET cancellation_requested_at=now() WHERE id=${transport.bookingId}`;
      });
      const response = await test.run();
      expect(response.status).toBe(409); expect((await response.json()).url).toBeUndefined();
      expect(await test.read()).toMatchObject({ status: "pending", paid_at: null, payment_id: null, total_amount: "100.00", currency: "USD",
        operator_earnings_cents: 8500, payment_mode: rail, checkout_session_id: test.sessionId, checkout_open: false });
      expect((await test.read()).cancellation_requested_at).toBeTruthy();
      expect(transport.expire).toHaveBeenCalledExactlyOnceWith(test.sessionId); expect(transport.create).not.toHaveBeenCalled();
    });
  }
});
