// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), transaction: vi.fn(), txQuery: vi.fn(), legacy: vi.fn(), auth: vi.fn(),
  verify: vi.fn(), instant: vi.fn(), status: vi.fn(), start: vi.fn(), review: vi.fn(), network: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: mocks.query, transaction: mocks.transaction }) }));
vi.mock("@/lib/env", () => ({ env: new Proxy({}, { get: (_target, key) => process.env[String(key)] }) }));
vi.mock("@/server/outreach-automation", () => ({ verifyOutreachUnsubscribeToken: mocks.legacy }));
vi.mock("@/server/business-onboarding", () => ({
  requireCurrentOperator: mocks.auth,
  assertListingId: (value: unknown) => { if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Invalid listing"); },
  onboardingErrorResponse: () => Response.json({ error: "Verification unavailable" }, { status: 400 }),
}));
vi.mock("@/server/claim-email-verification", () => ({
  completeEnhancedClaimVerification: mocks.verify, completeInstantDomainClaim: mocks.instant,
  getEnhancedClaimStatus: mocks.status, startEnhancedClaimVerification: mocks.start, submitManualClaimRequest: mocks.review,
}));

import { GET as visit } from "@/app/api/outreach/claim/route";
import { GET as unsubscribe, POST as unsubscribePost } from "@/app/api/outreach/unsubscribe/route";
import { POST as claim, GET as claimStatus } from "@/app/api/listings/claim/route";
import { claimInvitationUrl, unsubscribeInvitationUrl, OUTREACH_CONTEXT_COOKIE } from "@/server/outreach-attribution";

const attemptId = "71000000-0000-4000-8000-000000000001";
const listingId = "72000000-0000-4000-8000-000000000001";
const otherListing = "72000000-0000-4000-8000-000000000002";
const operatorId = "73000000-0000-4000-8000-000000000001";
const context = (url: string) => new URL(url).searchParams.get("context")!;
const invitation = () => claimInvitationUrl(attemptId, listingId);
function claimRequest(action: string, token = context(invitation()), id = listingId) {
  return new Request("https://vakaygo.audit.invalid/api/listings/claim", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: `${OUTREACH_CONTEXT_COOKIE}=${token}` },
    body: JSON.stringify({ action, listingId: id, code: "fixture" }),
  });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/vakaygo_test");
  vi.stubEnv("AUTH_SECRET", "fixture-attribution-signing-key-at-least-thirty-two-characters");
  vi.stubGlobal("fetch", mocks.network.mockRejectedValue(new Error("Unexpected external request")));
  mocks.query.mockImplementation(async (text: string) => text.startsWith("INSERT INTO outreach_claim_attributions") ? [{ listing_id: listingId }] : []);
  mocks.txQuery.mockImplementation((text: string, values: unknown[]) => ({ text, values }));
  mocks.transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") input({ query: mocks.txQuery });
    return [[], [], [{ id: attemptId }]];
  });
  mocks.legacy.mockImplementation((id: string, token: string) => id === listingId && token === "fixture-legacy-authorized");
  mocks.auth.mockResolvedValue({ ok: true, userId: operatorId, email: "operator@audit.invalid" });
  mocks.verify.mockResolvedValue({ claimVerified: true }); mocks.instant.mockResolvedValue({ claimVerified: true });
  mocks.status.mockResolvedValue({ claimVerified: false }); mocks.start.mockResolvedValue({ pending: true });
  mocks.review.mockResolvedValue({ claim: { status: "pending" } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("public invitation continuation", () => {
  it.each(["missing", "forged", "oversized", "wrong-purpose", "expired"])("does no database work for %s context", async kind => {
    let url = invitation();
    if (kind === "missing") url = "https://vakaygo.com/api/outreach/claim";
    if (kind === "forged") url = "https://vakaygo.com/api/outreach/claim?context=forged";
    if (kind === "oversized") url = `https://vakaygo.com/api/outreach/claim?context=${"x".repeat(601)}`;
    if (kind === "wrong-purpose") url = unsubscribeInvitationUrl(attemptId).replace("/unsubscribe?", "/claim?");
    if (kind === "expired") vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
    const response = await visit(new Request(url));
    expect(response.status).toBe(400);
    expect(response.cookies.getAll().length).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.network).not.toHaveBeenCalled();
  });
  it("redirects only to normal sign-up and sets a bounded first-party continuation cookie", async () => {
    const url = new URL(invitation());
    url.host = "untrusted.audit.invalid";
    url.searchParams.set("next", "https://untrusted.audit.invalid");
    const response = await visit(new Request(url));
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://vakaygo.com"); expect(target.pathname).toBe("/auth/signup");
    expect(target.searchParams.get("role")).toBe("operator"); expect(target.searchParams.get("claim")).toBe(listingId);
    expect(target.searchParams.has("context")).toBe(false); expect(target.searchParams.has("next")).toBe(false);
    const cookie = response.headers.get("set-cookie") || "";
    for (const flag of ["HttpOnly", "Secure", "SameSite=lax", "Max-Age=604800", "Path=/"]) expect(cookie.includes(flag)).toBe(true);
    expect(response.cookies.getAll().map(item => item.name)).toEqual([OUTREACH_CONTEXT_COOKIE]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][1]).toEqual([attemptId, listingId]);
    expect(mocks.query.mock.calls.every(([sql]) => sql.startsWith("INSERT INTO outreach_claim_attributions"))).toBe(true);
  });
  it("does not set context for an unavailable or unaccepted invitation", async () => {
    mocks.query.mockResolvedValueOnce([]);
    const response = await visit(new Request(invitation()));
    expect(response.status).toBe(404); expect(response.cookies.getAll().length).toBe(0);
  });
  it("returns a safe retry response when recording the visit fails", async () => {
    mocks.query.mockRejectedValueOnce(new Error("private database detail"));
    const response = await visit(new Request(invitation()));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json()).includes("private")).toBe(false);
    expect(response.cookies.getAll().length).toBe(0);
  });
});

describe("normal ownership verification remains authoritative", () => {
  it("does not bypass signed-in operator authentication with a valid invitation cookie", async () => {
    mocks.auth.mockResolvedValue({ ok: false, error: Response.json({ error: "Sign in required" }, { status: 401 }) });
    expect((await claim(claimRequest("verify"))).status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.instant).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not record a claim when normal verification rejects the challenge", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("Rejected challenge"));
    expect((await claim(claimRequest("verify"))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["verify", "instant_claim"])("runs %s normally before attempting bounded attribution", async action => {
    expect((await claim(claimRequest(action))).status).toBe(200);
    const normal = action === "verify" ? mocks.verify : mocks.instant;
    expect(normal).toHaveBeenCalledTimes(1); expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(normal.mock.invocationCallOrder[0] < mocks.query.mock.invocationCallOrder[0]).toBe(true);
    expect(mocks.query.mock.calls[0][1]).toEqual([attemptId, listingId, operatorId]);
  });
  it("does not attribute a different listing even after its normal verification succeeds", async () => {
    expect((await claim(claimRequest("verify", context(invitation()), otherListing))).status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledTimes(1); expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["start", "request_review"])("does not turn %s into a confirmed claim", async action => {
    expect((await claim(claimRequest(action))).status).toBe(201);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("keeps a successfully verified claim successful if optional attribution fails", async () => {
    mocks.query.mockRejectedValueOnce(new Error("private optional tracking failure"));
    const response = await claim(claimRequest("verify"));
    expect(response.status).toBe(200); expect((await response.json()).claimVerified).toBe(true);
  });
  it("preserves the normal authenticated status response", async () => {
    const response = await claimStatus(new Request(`https://vakaygo.com/api/listings/claim?listingId=${listingId}`));
    expect(response.status).toBe(200); expect((await response.json()).claimVerified).toBe(false);
    expect(mocks.status).toHaveBeenCalledTimes(1); expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("public opt-out", () => {
  it.each(["forged", "wrong-purpose", "legacy-invalid"])("does no database work for %s token", async kind => {
    const url = kind === "wrong-purpose" ? invitation().replace("/claim?", "/unsubscribe?") : kind === "legacy-invalid"
      ? `https://vakaygo.com/api/outreach/unsubscribe?listingId=${listingId}&token=invalid`
      : "https://vakaygo.com/api/outreach/unsubscribe?context=forged";
    expect((await unsubscribe(new NextRequest(url))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("acknowledges global recipient opt-out even when its original listing is deleted", async () => {
    // No business_outreach row can be returned for a deleted listing; attempt remains.
    mocks.transaction.mockResolvedValueOnce([[], [], [{ id: attemptId }]]);
    const response = await unsubscribe(new NextRequest(unsubscribeInvitationUrl(attemptId)));
    expect(response.status).toBe(200); expect((await response.text()).includes("business@audit.invalid")).toBe(false);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "ReadCommitted" });
  });
  it("uses the same signed opt-out handler for one-click POST", async () => {
    expect((await unsubscribePost(new NextRequest(unsubscribeInvitationUrl(attemptId), { method: "POST" }))).status).toBe(200);
    expect(mocks.txQuery.mock.calls[0][0].includes("pg_advisory_xact_lock")).toBe(true);
    expect(mocks.txQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO outreach_email_suppressions"))).toBe(true);
  });
  it("fails safely and does not report an unknown attempt as unsubscribed", async () => {
    mocks.transaction.mockResolvedValueOnce([[], [], []]);
    expect((await unsubscribe(new NextRequest(unsubscribeInvitationUrl(attemptId)))).status).toBe(404);
    mocks.transaction.mockRejectedValueOnce(new Error("private database detail"));
    const response = await unsubscribe(new NextRequest(unsubscribeInvitationUrl(attemptId)));
    expect(response.status).toBe(503); expect((await response.text()).includes("private")).toBe(false);
  });
  it("retains the valid legacy opt-out path without contacting external providers", async () => {
    const response = await unsubscribe(new NextRequest(`https://vakaygo.com/api/outreach/unsubscribe?listingId=${listingId}&token=fixture-legacy-authorized`));
    expect(response.status).toBe(200); expect(mocks.network).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "ReadCommitted" });
    expect(mocks.txQuery.mock.calls[0][0].includes("pg_advisory_xact_lock")).toBe(true);
    const statements = [...mocks.query.mock.calls, ...mocks.txQuery.mock.calls].map(([sql]) => String(sql));
    expect(statements.some(sql => sql.includes("INSERT INTO outreach_email_suppressions"))).toBe(true);
    expect(statements.some(sql => sql.includes("UPDATE outreach_recipient_consents"))).toBe(true);
  });
});
