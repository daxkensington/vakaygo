import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => db }));
import { claimInvitationUrl, unsubscribeInvitationUrl, decodeOutreachContext, recordApprovedOutreachClaim } from "@/server/outreach-attribution";
const attempt = "aaaaaaaa-0000-4000-8000-000000000001";
const listing = "aaaaaaaa-0000-4000-8000-000000000002";
const operator = "aaaaaaaa-0000-4000-8000-000000000003";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://audit:fixture@localhost:55436/vakaygo_test");
  vi.stubEnv("AUTH_SECRET", "synthetic-test-secret-for-claim-context-2026");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  db.query.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const token = (url: string) => new URL(url).searchParams.get("context")!;
// Happy DOM's browser Request strips forbidden Cookie headers; the route's
// server Request receives them from the HTTP connection.
const serverRequest = (cookie: string) => ({ headers: { get: (name: string) => name === "cookie" ? cookie : null } }) as unknown as Request;
describe("opaque campaign continuation", () => {
  it("binds purpose, attempt, listing and expiry without exposing an email", () => {
    const url = claimInvitationUrl(attempt, listing);
    expect(new URL(url).origin).toBe("https://vakaygo.com");
    expect(decodeOutreachContext(token(url), "claim")).toMatchObject({ attemptId: attempt, listingId: listing });
    expect(decodeOutreachContext(token(url), "unsubscribe")).toBeNull();
    expect(url).not.toMatch(/recipient|email|@/);
  });
  it("rejects tampering, invalid shape, oversized input and expired claims", () => {
    const value = token(claimInvitationUrl(attempt, listing));
    expect(decodeOutreachContext(value.slice(0, -1) + "!", "claim")).toBeNull();
    expect(decodeOutreachContext("x".repeat(601), "claim")).toBeNull();
    expect(decodeOutreachContext(value + ".extra", "claim")).toBeNull();
    vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
    expect(decodeOutreachContext(value, "claim")).toBeNull();
  });
  it("does not expire an opt-out or accept it as ownership continuation", () => {
    const value = token(unsubscribeInvitationUrl(attempt));
    vi.setSystemTime(new Date("2036-10-20T12:00:00Z"));
    expect(decodeOutreachContext(value, "unsubscribe")?.attemptId).toBe(attempt);
    expect(decodeOutreachContext(value, "claim")).toBeNull();
  });
  it("never attributes a different listing, unsigned context or no context", async () => {
    const value = token(claimInvitationUrl(attempt, listing));
    await recordApprovedOutreachClaim(new Request("https://fixture.invalid"), listing, operator);
    await recordApprovedOutreachClaim(serverRequest("vg_claim_context=forged"), listing, operator);
    await recordApprovedOutreachClaim(serverRequest(`vg_claim_context=${value}`), operator, operator);
    expect(db.query).not.toHaveBeenCalled();
  });
  it("records attribution only behind authoritative verified ownership and post-send claim SQL", async () => {
    const value = token(claimInvitationUrl(attempt, listing));
    await recordApprovedOutreachClaim(serverRequest(`vg_claim_context=${value}`), listing, operator);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [query, args] = db.query.mock.calls[0];
    expect(args).toEqual([attempt, listing, operator]);
    expect(query).toContain("c.status='approved'"); expect(query).toContain("u.email_verified=true");
    expect(query).toContain("vakaygo_listing_claim_verified"); expect(query).toContain("x.claimed_at IS NULL");
  });
});
