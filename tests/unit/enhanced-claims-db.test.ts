// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

const state = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), mail: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireUser: state.auth, requireAdmin: state.admin }));
vi.mock("@/server/mail-client", () => ({ sendEmail: state.mail }));
vi.mock("@/lib/revalidate-listing", () => ({ revalidateListing: vi.fn().mockResolvedValue(undefined) }));
import { completeEnhancedClaimVerification, completeInstantDomainClaim, startEnhancedClaimVerification } from "@/server/claim-email-verification";
import { PATCH } from "@/app/api/admin/claims/route";

const enabled = process.env.VAKAYGO_CLAIM_DB_TESTS === "true";
const actorId = "16000000-0000-4000-8000-000000000001", otherId = "16000000-0000-4000-8000-000000000002", adminId = "16000000-0000-4000-8000-000000000003";
const listingId = "16100000-0000-4000-8000-000000000001";
const manualId = "16200000-0000-4000-8000-000000000001";
const actorEmail = "owner@claim-fixture.invalid";
const actor = { ok: true, userId: actorId, sessionVersion: 7, role: "operator", emailVerified: true, email: actorEmail };
const admin = { ok: true, userId: adminId, sessionVersion: 7, role: "admin", emailVerified: true, email: "admin@claim-fixture.invalid" };
let db: NeonQueryFunction<false, false>, placeholderId: string;
const sentCode = () => String(state.mail.mock.calls.at(-1)?.[0].subject).match(/^\d{6}/)![0];
const start = () => startEnhancedClaimVerification(listingId, actorId, actorEmail, "email");
const complete = (code = sentCode()) => completeEnhancedClaimVerification(listingId, actorId, code);
const snapshot = async () => ({
  claims: await db`SELECT id,status,notes,role_at_business,reviewed_by FROM listing_claims WHERE listing_id=${listingId} ORDER BY created_at,id`,
  proofs: await db`SELECT id,claim_id,status,attempts,provider_verification_id FROM listing_claim_verifications WHERE listing_id=${listingId} ORDER BY created_at,id`,
  owners: await db`SELECT operator_id FROM listings WHERE id=${listingId}`,
  onboarding: await db`SELECT operator_id,verified_claim_id FROM listing_onboarding WHERE listing_id=${listingId}`,
});

describe.skipIf(!enabled)("enhanced claims against isolated PostgreSQL", () => {
  beforeAll(async () => {
    // Opt-in alone must never make these integration writes target a real DB.
    const url = new URL(process.env.DATABASE_URL || "http://invalid");
    const ownedLocal = url.hostname === "127.0.0.1" && url.port === "5498";
    const hostedFixture = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
    if ((!ownedLocal && !hostedFixture) || url.pathname !== "/vakaygo_test" || url.username !== "audit") throw new Error("Owned audit or hosted disposable PostgreSQL required");
    db = neon(process.env.DATABASE_URL!);
    await db`INSERT INTO islands(id,slug,name,country) VALUES(995016,'claim-audit-fixture','Claim audit fixture','Canada') ON CONFLICT(id) DO NOTHING`;
    await db`INSERT INTO users(email,name,role,email_verified) VALUES('unclaimed@vakaygo.com','Import placeholder','operator',false) ON CONFLICT(email) DO NOTHING`;
    placeholderId = String((await db`SELECT id FROM users WHERE email='unclaimed@vakaygo.com'`)[0].id);
    await db`INSERT INTO users(id,email,name,role,email_verified,session_version) VALUES
      (${actorId},${actorEmail},'Claim fixture owner','operator',true,7),
      (${otherId},'other@claim-fixture.invalid','Claim fixture competitor','operator',true,7),
      (${adminId},'admin@claim-fixture.invalid','Claim fixture admin','admin',true,7)
      ON CONFLICT(id) DO NOTHING`;
  });
  beforeEach(async () => {
    await db`DELETE FROM listing_onboarding WHERE listing_id=${listingId}`;
    await db`DELETE FROM listings WHERE id=${listingId}`;
    await db`UPDATE users SET email_verified=true,session_version=7 WHERE id IN (${actorId},${otherId},${adminId})`;
    await db`UPDATE users SET email=${actorEmail} WHERE id=${actorId}`;
    await db`INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,type_data)
      VALUES(${listingId},${placeholderId},995016,'tour','Claim <fixture>','claim-audit-target','active',50,'USD','person',4,
        ${JSON.stringify({ email: actorEmail, website: 'https://claim-fixture.invalid', unclaimed: true })}::json)`;
    state.auth.mockReset().mockResolvedValue(actor); state.admin.mockReset().mockResolvedValue(admin); state.mail.mockReset().mockResolvedValue({ id: "synthetic" });
  });
  afterAll(async () => {
    if (!db) return;
    await db`DELETE FROM listing_onboarding WHERE listing_id=${listingId}`;
    await db`DELETE FROM listings WHERE id=${listingId}`;
    await db`DELETE FROM users WHERE id IN (${actorId},${otherId},${adminId})`;
    await db`DELETE FROM islands WHERE id=995016`;
  });

  it("sends a schema-compatible code and atomically approves its original claim/proof exactly once", async () => {
    const started = await start(), code = sentCode();
    const before = await snapshot();
    expect(before.proofs).toHaveLength(1); expect(String(before.proofs[0].provider_verification_id)).toMatch(/^[a-f0-9]{64}$/);
    expect(state.mail.mock.calls[0][0].html).toContain("Claim &lt;fixture&gt;");
    const results = await Promise.all([complete(code), complete(code)]);
    expect(results.map(result => result.claim.id)).toEqual([started.claim.id, started.claim.id]);
    const after = await snapshot();
    expect(after.claims).toHaveLength(1); expect(after.claims[0].status).toBe("approved");
    expect(after.proofs).toHaveLength(1); expect(after.proofs[0].id).toBe(before.proofs[0].id); expect(after.proofs[0].status).toBe("verified");
    expect(after.owners[0].operator_id).toBe(actorId); expect(after.onboarding[0].verified_claim_id).toBe(before.proofs[0].id);
    await db`UPDATE listings SET type_data=(type_data::jsonb-'email')::json WHERE id=${listingId}`;
    expect((await complete(code)).claim.id).toBe(started.claim.id);
  });
  it("does not replace or resend an active challenge on another start", async () => {
    await start(); const code = sentCode(), before = await snapshot();
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(state.mail).toHaveBeenCalledTimes(1); expect(await snapshot()).toEqual(before);
    await complete(code);
  });
  it("serializes competing starts and keeps only one active proof", async () => {
    const results = await Promise.allSettled([start(), start()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(state.mail).toHaveBeenCalledTimes(1); expect((await snapshot()).proofs).toHaveLength(1);
  });
  it("counts wrong codes atomically and closes the challenge after five attempts", async () => {
    await start(); const correct = sentCode(), wrong = correct === "100000" ? "100001" : "100000";
    const results = await Promise.allSettled(Array.from({ length: 7 }, () => complete(wrong)));
    expect(results.every(result => result.status === "rejected")).toBe(true);
    expect((await snapshot()).proofs[0].attempts).toBe(5);
    await expect(complete(correct)).rejects.toMatchObject({ status: 409 });
    expect((await snapshot()).owners[0].operator_id).toBe(placeholderId);
  });
  it("marks failed email delivery recoverable without approving any claim", async () => {
    state.mail.mockRejectedValueOnce(new Error("synthetic delivery failure"));
    await expect(start()).rejects.toMatchObject({ status: 503 });
    const failed = await snapshot(); expect(failed.proofs[0].status).toBe("failed"); expect(failed.claims[0].status).toBe("pending");
    await start(); await complete();
    expect((await snapshot()).claims.filter(claim => claim.status === "approved")).toHaveLength(1);
  });
  it("replaces only expired challenges and preserves history", async () => {
    await start();
    await db`UPDATE listing_claim_verifications SET expires_at=now()-interval '1 second' WHERE listing_id=${listingId}`;
    await start(); await complete();
    const after = await snapshot(); expect(after.proofs.map(proof => proof.status).sort()).toEqual(["expired", "verified"]);
    expect(after.claims.map(claim => claim.status).sort()).toEqual(["approved", "rejected"]);
  });
  it("rejects changed published email or trusted phone without transferring ownership", async () => {
    await start(); const code = sentCode();
    await db`UPDATE listings SET type_data=jsonb_set(type_data::jsonb,'{email}','"replacement@example.invalid"')::json WHERE id=${listingId}`;
    await expect(complete(code)).rejects.toMatchObject({ status: 400 });
    await db`UPDATE listings SET type_data=jsonb_set(type_data::jsonb,'{email}',${JSON.stringify(actorEmail)}::jsonb)::json WHERE id=${listingId}`;
    await db`UPDATE listing_trusted_contacts SET phone='+12465550999' WHERE listing_id=${listingId}`;
    await expect(complete(code)).rejects.toMatchObject({ status: 409 });
    expect((await snapshot()).owners[0].operator_id).toBe(placeholderId);
  });
  it("revalidates a session revoked after route authentication, before any claim write", async () => {
    state.auth.mockImplementationOnce(async () => {
      await db`UPDATE users SET session_version=8 WHERE id=${actorId}`;
      return actor;
    });
    await expect(start()).rejects.toMatchObject({ status: 401 });
    expect((await snapshot()).claims).toHaveLength(0); expect(state.mail).not.toHaveBeenCalled();
  });
  it("does not transfer a business whose owner changed after the email was sent", async () => {
    await start(); const code = sentCode();
    await db`UPDATE listings SET operator_id=${otherId} WHERE id=${listingId}`;
    await expect(complete(code)).rejects.toMatchObject({ status: 409 });
    expect((await snapshot()).owners[0].operator_id).toBe(otherId); expect((await snapshot()).onboarding).toHaveLength(0);
  });
  it("rejects an account email changed after authentication without an epoch bump", async () => {
    state.auth.mockImplementationOnce(async () => {
      await db`UPDATE users SET email='replaced-owner@claim-fixture.invalid' WHERE id=${actorId}`;
      return actor;
    });
    await expect(start()).rejects.toMatchObject({ status: 401 });
    expect((await snapshot()).claims).toHaveLength(0); expect(state.mail).not.toHaveBeenCalled();
  });
  it("domain proof consumes its own pending claim and cannot steal a competitor's active proof", async () => {
    const started = await start(), before = await snapshot();
    state.auth.mockResolvedValueOnce({ ...actor, userId: otherId, email: 'other@claim-fixture.invalid' });
    await expect(completeInstantDomainClaim(listingId, otherId, 'other@claim-fixture.invalid')).rejects.toMatchObject({ status: 409 });
    const result = await completeInstantDomainClaim(listingId, actorId, actorEmail);
    expect(result.claim.id).toBe(started.claim.id);
    expect((await snapshot()).proofs[0].id).toBe(before.proofs[0].id);
    expect((await completeInstantDomainClaim(listingId, actorId, actorEmail)).claim.id).toBe(started.claim.id);
  });
  it("instant domain proof creates its first claim and onboarding atomically", async () => {
    await completeInstantDomainClaim(listingId, actorId, actorEmail);
    const after = await snapshot(); expect(after.claims).toHaveLength(1); expect(after.claims[0].status).toBe("approved"); expect(after.onboarding).toHaveLength(1);
  });
  it("admin approval preserves the selected request, evidence and reviewer and safely replays", async () => {
    await db`INSERT INTO listing_claims(id,listing_id,operator_id,contact_name,contact_phone,role_at_business,notes)
      VALUES(${manualId},${listingId},${actorId},'Selected applicant','Not provided','Owner','Original evidence')`;
    const request = () => new Request("https://vakaygo.com/api/admin/claims", { method: "PATCH", body: JSON.stringify({ id: manualId, action: "approve", adminNotes: "Checked evidence" }) });
    expect((await PATCH(request())).status).toBe(200); expect((await PATCH(request())).status).toBe(200);
    const after = await snapshot(); expect(after.claims).toHaveLength(1);
    expect(after.claims[0]).toMatchObject({ id: manualId, status: "approved", reviewed_by: adminId, notes: "Original evidence", role_at_business: "Owner" });
  });
  it("rolls back proof, original claim and ownership if onboarding insertion fails", async () => {
    await start(); const before = await snapshot();
    await db.query(`CREATE OR REPLACE FUNCTION audit_claim_forced_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.listing_id='${listingId}'::uuid THEN RAISE EXCEPTION 'synthetic onboarding failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER audit_claim_forced_failure BEFORE INSERT ON listing_onboarding FOR EACH ROW EXECUTE FUNCTION audit_claim_forced_failure()");
    try { await expect(complete()).rejects.toThrow("synthetic onboarding failure"); }
    finally { await db.query("DROP TRIGGER audit_claim_forced_failure ON listing_onboarding"); await db.query("DROP FUNCTION audit_claim_forced_failure()"); }
    expect(await snapshot()).toEqual(before);
  });
  it.each(["email", "domain"])("rolls back a %s claim if a trigger silently suppresses approval", async mode => {
    if (mode === "email") await start();
    const before = await snapshot();
    await db.query(`CREATE OR REPLACE FUNCTION audit_claim_skip_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.listing_id='${listingId}'::uuid AND NEW.status='approved' THEN RETURN NULL; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER audit_claim_skip_approval BEFORE UPDATE ON listing_claims FOR EACH ROW EXECUTE FUNCTION audit_claim_skip_approval()");
    try { await expect(mode === "email" ? complete() : completeInstantDomainClaim(listingId, actorId, actorEmail)).rejects.toMatchObject({ status: 409 }); }
    finally { await db.query("DROP TRIGGER audit_claim_skip_approval ON listing_claims"); await db.query("DROP FUNCTION audit_claim_skip_approval()"); }
    expect(await snapshot()).toEqual(before);
  });
});
