// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ neon: vi.fn(), transaction: vi.fn(), txQuery: vi.fn(), query: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("@/lib/env", () => ({ env: new Proxy({}, { get: (_target, key) => process.env[String(key)] }) }));

import { applyCampaignAdminAction, readCampaignReport } from "@/server/outreach-campaign-control";
import { parseCampaignAdminAction, type CampaignAdminAction } from "@/lib/outreach-campaign-admin";

const actor = { userId: "63000000-0000-4000-8000-000000000001", sessionVersion: 3, email: "reviewer@audit.invalid" };
const grant = (country: string, kind = "business_outreach_permission") => parseCampaignAdminAction({
  action: "grant_consent", listingId: "64000000-0000-4000-8000-000000000001", recipientEmail: "info@hotel-example.com",
  expectedListingEmail: "info@hotel-example.com", provider: "sendcorex", permissionKind: kind, recipientCountry: country,
  policyReference: "Dated provider and country policy review", evidence: "Address published on the business website contact page.",
}) as CampaignAdminAction;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
  mocks.neon.mockReturnValue({ transaction: mocks.transaction, query: mocks.query });
  mocks.txQuery.mockImplementation((text: string, values: unknown[]) => ({ text, values }));
  mocks.transaction.mockImplementation(async (build: (tx: { query: typeof mocks.txQuery }) => unknown[]) => {
    const statements = build({ query: mocks.txQuery });
    return statements.map((_statement, index) => index === statements.length - 1 ? [{ actorExists: true, changed: true }] : []);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("recording permission by country", () => {
  it.each([["GR", /prior opt-in/], ["ES", /prior opt-in/], ["IT", /prior opt-in/], ["HR", /prior opt-in/], ["CR", /prior opt-in/],
    ["MQ", /on hold/], ["GP", /on hold/], ["CO", /on hold/]])("refuses business permission for %s before any database work", async (country, message) => {
    await expect(applyCampaignAdminAction(actor, grant(country))).rejects.toMatchObject({ status: 400, message: expect.stringMatching(message) });
    expect(mocks.neon).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["GD", "PR", "DO"])("records business permission for %s", async country => {
    await expect(applyCampaignAdminAction(actor, grant(country))).resolves.toBeUndefined();
    expect(mocks.txQuery.mock.calls.some(([text]) => String(text).includes("INSERT INTO outreach_recipient_consents"))).toBe(true);
  });

  it("still records the recipient's own explicit opt-in in a prior opt-in country", async () => {
    await expect(applyCampaignAdminAction(actor, grant("GR", "explicit_opt_in"))).resolves.toBeUndefined();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("records a held country once the owner releases it", async () => {
    vi.stubEnv("OUTREACH_RELEASED_COUNTRIES", "MQ");
    await expect(applyCampaignAdminAction(actor, grant("MQ"))).resolves.toBeUndefined();
    await expect(applyCampaignAdminAction(actor, grant("GP"))).rejects.toMatchObject({ status: 400 });
  });
});

describe("recorded delivery review", () => {
  const review = { action: "acknowledge_delivery_review", expectedVersion: 12, note: "Checked the three bounced addresses: dead domains." } as CampaignAdminAction;

  it("stamps only the review record under the campaign lock and the version check", async () => {
    await applyCampaignAdminAction(actor, review);
    const statements = mocks.txQuery.mock.calls.map(([text]) => String(text));
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    const write = mocks.txQuery.mock.calls.at(-1)!;
    expect(String(write[0])).toContain("holds_reviewed_at=now(),holds_reviewed_by=actor.id,holds_review_note=$5");
    expect(String(write[0])).toContain("c.version=$4");
    expect(String(write[0])).toContain("role='admin'");
    // It is not the enable/stage statement and cannot change sending state.
    expect(String(write[0])).not.toMatch(/enabled=|stage=|provider=|health_ready=/);
    expect(write[1]).toEqual([actor.userId, actor.sessionVersion, actor.email, 12, "Checked the three bounced addresses: dead domains."]);
  });

  it("reports a version conflict or a missing migration as a refusal, not a success", async () => {
    mocks.transaction.mockResolvedValueOnce([[], [], [{ actorExists: true, changed: false }]]);
    await expect(applyCampaignAdminAction(actor, review)).rejects.toMatchObject({ status: 409 });
    mocks.transaction.mockRejectedValueOnce(new Error('column "holds_reviewed_at" does not exist'));
    await expect(applyCampaignAdminAction(actor, review)).rejects.toThrow();
  });
});

describe("campaign report", () => {
  const snapshot = { enabled: true, stage: 0, provider: "sendcorex", version: 3, stageStartedAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z",
    pauseReason: "", telemetryHealthy: true, healthReason: "provider_metadata_verified", reserved24h: 2, accepted: 20, delivered: 16, bounced: 3,
    complained: 0, uncertain: 0, failed: 1, opened: 0, clicked: 0, overdue: 0, matureAccepted: 18, matureResolved: 17,
    holdAccepted: 4, holdBounced: 1, holdFailed: 0, holdsReviewedAt: "2026-10-20T11:00:00+00", holdsReviewNote: "Checked the bounced addresses",
    suppressions: 3, linkVisits: 2, approvedClaimsFromLinks: 0, activePermissions: 40 };

  beforeEach(() => {
    vi.stubEnv("OUTREACH_PROVIDER", "sendcorex"); vi.stubEnv("SENDCOREX_API_KEY", "fixture"); vi.stubEnv("SENDCOREX_WEBHOOK_ID", "wh_fixture");
    vi.stubEnv("SENDCOREX_WEBHOOK_SECRET", "fixture-secret-with-more-than-thirty-two-characters");
    vi.stubEnv("AUTH_SECRET", "fixture-attribution-signing-key-at-least-thirty-two-characters");
    vi.stubEnv("OUTREACH_SENDER_POSTAL_ADDRESS", "Fixture Company, 123 Example Road, Test City");
  });

  it("uses the counts since the recorded review for the sending hold and shows both sets of facts", async () => {
    mocks.query.mockResolvedValueOnce([snapshot]).mockResolvedValueOnce([]);
    const report = await readCampaignReport();
    // Three bounces in 7 days would hold a 20-message sample; one since the review does not.
    expect(report.health.ready).toBe(true);
    expect(report.metrics.bounced).toBe(3);
    expect(report.deliveryReview).toEqual({ reviewedAt: "2026-10-20T11:00:00+00", note: "Checked the bounced addresses", acceptedSince: 4, bouncedSince: 1, failedSince: 0 });
    expect(report.health.nextStageAllowed).toBe(false);
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("(to_jsonb(c0)->>'holds_reviewed_at')::timestamptz");
    expect(sql).toContain("a.bounced_at>=c.hold_since");
  });

  it("holds when the counts since the review pass the limit", async () => {
    mocks.query.mockResolvedValueOnce([{ ...snapshot, holdBounced: 3 }]).mockResolvedValueOnce([]);
    expect((await readCampaignReport()).health.reasons).toContain("bounce_rate_hold");
    mocks.query.mockResolvedValueOnce([{ ...snapshot, holdFailed: 5 }]).mockResolvedValueOnce([]);
    expect((await readCampaignReport()).health.reasons).toContain("failure_rate_hold");
    // The soft-failure hold belongs to the Sendcorex transport only.
    vi.stubEnv("OUTREACH_PROVIDER", "resend"); vi.stubEnv("RESEND_API_KEY", "re_fixture"); vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_fixture");
    mocks.query.mockResolvedValueOnce([{ ...snapshot, provider: "resend", holdFailed: 5 }]).mockResolvedValueOnce([]);
    expect((await readCampaignReport()).health.reasons).not.toContain("failure_rate_hold");
  });
});
