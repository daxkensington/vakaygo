// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: vi.fn<(text: string, values?: unknown[]) => Promise<unknown[]>>(),
  establish: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: state.query }) }));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "synthetic-signing-secret-of-at-least-32-chars" } }));
vi.mock("@/server/email-identity", () => ({ establishEmailIdentity: state.establish }));
vi.mock("@/server/admin-auth", () => ({ setSessionCookie: state.setCookie }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { SETUP_LINK_TTL_MS, consumeSetupLink, createSetupLinkToken, setupLinkDestination, setupLinkUrl, setupLinksAvailable } from "@/server/operator-setup-link";
import * as route from "@/app/api/auth/setup-link/route";

const nudgeId = "11111111-1111-4111-8111-111111111111";
const operatorId = "22222222-2222-4222-8222-222222222222";
const sentAt = new Date("2026-11-11T16:15:00Z");
const next = `/operator/onboarding/33333333-3333-4333-8333-333333333333`;
const soon = new Date("2026-11-12T09:00:00Z");

const row = (over: Record<string, unknown> = {}) => ({
  id: nudgeId, operator_id: operatorId, recipient: "owner@example.invalid", sent_at: sentAt.toISOString(), signin_used_at: null,
  email: "Owner@Example.invalid", role: "operator", session_version: 4, totp_enabled: false, owns_listing: true, ...over,
});
const identity = { id: operatorId, email: "owner@example.invalid", name: "Owner", role: "operator", sessionVersion: 4, requiresTwoFactor: false, credentialsReset: false };
const token = (over: Partial<Parameters<typeof createSetupLinkToken>[0]> = {}) => createSetupLinkToken({ nudgeId, operatorId, sessionVersion: 4, sentAt, next, ...over })!;

/** First query = the lookup, second = the one-use claim. */
function database(lookup: unknown[], claimed: unknown[] = [{ id: nudgeId }]) {
  state.query.mockReset();
  state.query.mockResolvedValueOnce(lookup).mockResolvedValueOnce(claimed);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://synthetic.invalid/db");
  state.query.mockReset(); state.establish.mockReset().mockResolvedValue(identity); state.setCookie.mockReset();
});

describe("setup link destinations", () => {
  it("accepts only pages inside the operator area", () => {
    expect(setupLinkDestination(next)).toBe(next);
    expect(setupLinkDestination("/operator/payouts?listingId=abc")).toBe("/operator/payouts?listingId=abc");
    expect(setupLinkDestination("/operator")).toBe("/operator");
    for (const bad of ["/admin", "/operators", "/api/operator/stats", "//evil.example/operator/x", "https://evil.example/operator", "/operator/../admin", "/auth/signin", "", null, 7])
      expect(setupLinkDestination(bad), String(bad)).toBeNull();
  });
  it("mints nothing for a destination outside the operator area or a malformed id", () => {
    expect(createSetupLinkToken({ nudgeId, operatorId, sessionVersion: 4, sentAt, next: "/admin/users" })).toBeNull();
    expect(createSetupLinkToken({ nudgeId: "not-a-uuid", operatorId, sessionVersion: 4, sentAt, next })).toBeNull();
    expect(setupLinkUrl("https://vakaygo.com", token(), next)).toBe(`https://vakaygo.com/auth/setup-link?token=${encodeURIComponent(token())}&next=${encodeURIComponent(next)}`);
  });
});

describe("consumeSetupLink", () => {
  it("signs the operator in once and sends them to the signed destination", async () => {
    database([row()]);
    const result = await consumeSetupLink(token(), next, soon);
    expect(result).toEqual({ ok: true, identity, redirect: next });
    // The use is claimed with the session version and address the link was issued for.
    expect(String(state.query.mock.calls[1][0])).toMatch(/signin_used_at=now\(\)[\s\S]*signin_used_at IS NULL[\s\S]*session_version=\$2/);
    expect(state.query.mock.calls[1][1]).toEqual([nudgeId, 4]);
    expect(state.establish).toHaveBeenCalledWith(operatorId);
  });

  it("refuses a second use, whether it already shows as used or loses the race for the row", async () => {
    database([row({ signin_used_at: "2026-11-11T17:00:00Z" })]);
    expect(await consumeSetupLink(token(), next, soon)).toEqual({ ok: false, reason: "used" });
    expect(state.query).toHaveBeenCalledTimes(1);
    database([row()], []);
    expect(await consumeSetupLink(token(), next, soon)).toEqual({ ok: false, reason: "used" });
    expect(state.establish).not.toHaveBeenCalled();
  });

  it("expires seven days after the reminder was sent", async () => {
    database([row()]);
    expect(await consumeSetupLink(token(), next, new Date(sentAt.getTime() + SETUP_LINK_TTL_MS - 60_000))).toMatchObject({ ok: true });
    database([row()]);
    expect(await consumeSetupLink(token(), next, new Date(sentAt.getTime() + SETUP_LINK_TTL_MS + 1000))).toEqual({ ok: false, reason: "expired" });
    // A validly signed link cannot claim a later expiry than its reminder allows.
    database([row()]);
    expect(await consumeSetupLink(token({ sentAt: new Date(sentAt.getTime() + 86_400_000) }), next, soon)).toEqual({ ok: false, reason: "invalid" });
    expect(state.establish).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a different destination", () => [token(), "/operator/payouts"] as const, {}],
    ["a tampered signature", () => [token().replace(/.$/, c => (c === "A" ? "B" : "A")), next] as const, {}],
    ["a changed session version (password change or sign out everywhere)", () => [token(), next] as const, { session_version: 5 }],
    ["an administrator account", () => [token(), next] as const, { role: "admin" }],
    ["a traveler account", () => [token(), next] as const, { role: "traveler" }],
    ["an account whose address changed since the reminder", () => [token(), next] as const, { email: "new-owner@example.invalid" }],
    ["a listing the operator no longer owns", () => [token(), next] as const, { owns_listing: false }],
    ["a link signed for another operator", () => [token({ operatorId: "44444444-4444-4444-8444-444444444444" }), next] as const, {}],
  ])("rejects %s without using the link up", async (_label, build, over) => {
    database([row(over)]);
    const [value, destination] = build();
    expect(await consumeSetupLink(value, destination, soon)).toEqual({ ok: false, reason: "invalid" });
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.establish).not.toHaveBeenCalled();
  });

  it("rejects malformed input before touching the database", async () => {
    for (const bad of [undefined, null, 5, "", "a.b", `${nudgeId}.123.sig`, `${nudgeId}.1794300000.short`, "x".repeat(300)]) {
      expect(await consumeSetupLink(bad, next, soon)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await consumeSetupLink(token(), "/admin", soon)).toEqual({ ok: false, reason: "invalid" });
    expect(state.query).not.toHaveBeenCalled();
  });

  it("returns invalid for an unknown reminder and never matches a team reminder row", async () => {
    database([]);
    expect(await consumeSetupLink(token(), next, soon)).toEqual({ ok: false, reason: "invalid" });
    expect(String(state.query.mock.calls[0][0])).toContain("x.stage<>'admin_review'");
  });

  it("sends an account with two-factor authentication to the normal sign-in", async () => {
    database([row({ totp_enabled: true })]);
    expect(await consumeSetupLink(token(), next, soon)).toEqual({ ok: false, reason: "use_password" });
    expect(state.query).toHaveBeenCalledTimes(1);
    database([row()]);
    state.establish.mockResolvedValueOnce({ ...identity, requiresTwoFactor: true });
    expect(await consumeSetupLink(token(), next, soon)).toEqual({ ok: false, reason: "use_password" });
  });

  it("is unavailable, not an error, on a database without the one-use marker", async () => {
    state.query.mockReset().mockRejectedValueOnce(Object.assign(new Error("column x.signin_used_at does not exist"), { code: "42703" }));
    expect(await consumeSetupLink(token(), next, soon)).toEqual({ ok: false, reason: "unavailable" });
    state.query.mockReset().mockResolvedValueOnce([]);
    expect(await setupLinksAvailable()).toBe(false);
    state.query.mockReset().mockResolvedValueOnce([{ "?column?": 1 }]);
    expect(await setupLinksAvailable()).toBe(true);
    state.query.mockReset().mockRejectedValueOnce(new Error("offline"));
    expect(await setupLinksAvailable()).toBe(false);
  });
});

describe("POST /api/auth/setup-link", () => {
  const post = (body: unknown) => route.POST(new Request("https://vakaygo.com/api/auth/setup-link", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("has no GET handler, so opening or scanning the link can never sign in", () => {
    expect(Object.keys(route).filter(name => /^(GET|PUT|PATCH|DELETE|HEAD)$/.test(name))).toEqual([]);
  });

  it("sets the session only for a valid link and returns its destination", async () => {
    database([row()]);
    const ok = await post({ token: token(), next });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, redirect: next });
    expect(state.setCookie).toHaveBeenCalledWith({ id: operatorId, email: "owner@example.invalid", name: "Owner", role: "operator", sessionVersion: 4 });
  });

  it("sets no session for a used, expired, invalid or malformed request", async () => {
    database([row({ signin_used_at: "2026-11-11T17:00:00Z" })]);
    const used = await post({ token: token(), next });
    expect(used.status).toBe(400); expect((await used.json()).reason).toBe("used");
    const malformed = await post("not json");
    expect(malformed.status).toBe(400); expect((await malformed.json()).reason).toBe("invalid");
    database([row({ totp_enabled: true })]);
    const twoFactor = await post({ token: token(), next });
    expect(twoFactor.status).toBe(403); expect(await twoFactor.json()).toMatchObject({ requiresPassword: true, reason: "use_password" });
    expect(state.setCookie).not.toHaveBeenCalled();
  });
});
