// @vitest-environment node
import { createHash, createHmac } from "node:crypto";
import { Resend } from "resend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), verify: vi.fn(), error: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: mocks.query, transaction: mocks.transaction }) }));
vi.mock("@/server/mail-client", () => ({ getMailClient: () => ({ webhooks: { verify: mocks.verify } }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error } }));
vi.mock("@/lib/env", () => ({ env: new Proxy({}, { get: (_target, key) => process.env[String(key)] }) }));

import { POST } from "@/app/api/webhooks/resend/route";
import {
  InvalidOutreachEvent, normalizeOutreachRecipient, parseResendOutreachEvent,
  recordOutreachAccepted, recordOutreachFailure, recordOutreachProviderEvent, suppressOutreachRecipient,
} from "@/server/outreach-tracking";

const now = new Date("2026-10-20T12:00:00Z");
const secretKey = Buffer.alloc(32, 7);
const secret = `whsec_${secretKey.toString("base64")}`;
const attemptId = "11111111-1111-4111-8111-111111111111";
function payload(type = "email.delivered", data: Record<string, unknown> = {}, createdAt = now.toISOString()) {
  return { type, created_at: createdAt, data: { email_id: "provider-email-1", to: ["Business@audit.invalid"], ...data } };
}
function signedRequest(value: unknown, options: { timestamp?: number; tamper?: boolean; headers?: Record<string, string> } = {}) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const timestamp = String(options.timestamp ?? Math.floor(now.getTime() / 1000));
  const id = "msg_fixture_1";
  const signature = createHmac("sha256", secretKey).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request("https://vakaygo.audit.invalid/api/webhooks/resend", {
    method: "POST", headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`, ...options.headers },
    body: options.tamper ? body + " " : body,
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
  vi.stubEnv("AUTH_SECRET", "fixture-auth-secret-at-least-thirty-two-characters");
  vi.stubEnv("RESEND_API_KEY", "re_fixture_no_network");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  mocks.query.mockReturnValue([]);
  mocks.transaction.mockResolvedValue([[], [{}], [{ applied: 1 }]]);
  // Verify against the installed provider SDK, not a test-only signature parser.
  mocks.verify.mockImplementation(options => new Resend("re_fixture_no_network").webhooks.verify(options));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("signed outreach webhook", () => {
  it("verifies original bytes and stores only bounded evidence metadata", async () => {
    const input = payload("email.clicked", { click: { link: "https://private.audit.invalid/path?token=private" }, subject: "private subject", html: "private body" });
    expect((await POST(signedRequest(input))).status).toBe(200);
    const [, params] = mocks.query.mock.calls.find(([text]) => text.startsWith("INSERT INTO outreach_email_events"))!;
    expect(params).toEqual(["resend", "msg_fixture_1", "provider-email-1", "email.clicked", now.toISOString(), createHash("sha256").update("business@audit.invalid").digest("hex"), null, "webhook"]);
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("private");
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("Business@");
  });
  it("fails closed when webhook configuration is absent", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect((await POST(signedRequest(payload()))).status).toBe(503);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects missing signature headers without persistence", async () => {
    expect((await POST(new Request("https://audit.invalid/webhook", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["tamper", "expired", "future", "wrong-key"])("rejects %s signatures without writes", async kind => {
    if (kind === "wrong-key") vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${Buffer.alloc(32, 8).toString("base64")}`);
    const timestamp = Math.floor(now.getTime() / 1000) + (kind === "expired" ? -600 : kind === "future" ? 600 : 0);
    expect((await POST(signedRequest(payload(), { timestamp, tamper: kind === "tamper" }))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("bounds the raw body even without a content-length header", async () => {
    expect((await POST(signedRequest("x".repeat(65_537)))).status).toBe(413);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("acknowledges unrelated authenticated provider event types without storing them", async () => {
    const response = await POST(signedRequest(payload("contact.created")));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, ignored: true });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([
    payload("email.bounced", { to: ["first@audit.invalid", "second@audit.invalid"] }),
    payload("email.bounced", { to: ["not-an-email"] }),
    payload("email.bounced", { email_id: "unexpected/identifier" }),
    payload("email.bounced", {}, "2026-10-20T12:00:00"),
    payload("email.bounced", {}, "2026-10-20T13:00:00Z"),
  ])("rejects a signed event with ambiguous recipient or invalid metadata", async input => {
    expect((await POST(signedRequest(input))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("returns a safe retry response when persistence fails", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("secret provider credential and private recipient"));
    const response = await POST(signedRequest(payload()));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/secret|credential|recipient/);
    expect(mocks.error).toHaveBeenCalledWith("Outreach webhook persistence failed", { code: "OUTREACH_EVENT_PERSISTENCE" });
  });
});

describe("outreach evidence contracts", () => {
  it("normalizes addresses without accepting display names or multiple recipients", () => {
    expect(normalizeOutreachRecipient(" Business@audit.invalid ")).toBe("business@audit.invalid");
    expect(normalizeOutreachRecipient("Business <business@audit.invalid>")).toBeNull();
    expect(normalizeOutreachRecipient("a@audit.invalid,b@audit.invalid")).toBeNull();
  });
  it("keeps open/click as observed provider events and strips bounce details", () => {
    expect(parseResendOutreachEvent(payload("email.opened"))?.eventType).toBe("email.opened");
    expect(parseResendOutreachEvent(payload("email.bounced", { bounce: { type: "Permanent", message: "private SMTP response" } }))?.bounceType).toBe("permanent");
    expect(JSON.stringify(parseResendOutreachEvent(payload("email.bounced", { bounce: { type: "Permanent", message: "private SMTP response" } })))).not.toContain("SMTP");
  });
  it("serializes webhook ingestion and response acceptance under the same scoped lock", async () => {
    const event = parseResendOutreachEvent(payload())!;
    await recordOutreachProviderEvent("msg_fixture_1", event);
    await recordOutreachAccepted(attemptId, event.providerEmailId);
    const locks = mocks.query.mock.calls.filter(([text]) => text.includes("pg_advisory_xact_lock"));
    expect(locks).toHaveLength(2);
    expect(locks[0][1]).toEqual(locks[1][1]);
    expect(locks[0][1]).toEqual(["vakaygo-outreach:resend:provider-email-1"]);
    for (const [, options] of mocks.transaction.mock.calls) expect(options).toEqual({ isolationLevel: "ReadCommitted" });
    const calls = mocks.query.mock.calls;
    expect(calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(calls[1][0]).toContain("INSERT INTO outreach_email_events");
    expect(calls[3][0]).toContain("pg_advisory_xact_lock");
  });
  it("defaults unknown send outcomes to uncertain and never overwrites accepted state", async () => {
    await recordOutreachFailure(attemptId, "network_timeout");
    expect(mocks.query.mock.calls[0][1]).toEqual([attemptId, "uncertain", "network_timeout"]);
    expect(mocks.query.mock.calls[0][0]).toContain("state IN ('reserved','uncertain')");
    await recordOutreachFailure(attemptId, "provider_rejected", { uncertain: false });
    expect(mocks.query.mock.calls[1][1][1]).toBe("failed");
    await expect(recordOutreachFailure(attemptId, "raw upstream error secret")).rejects.toBeInstanceOf(InvalidOutreachEvent);
  });
  it("scopes provider IDs and validates caller-supplied identifiers before SQL", async () => {
    await recordOutreachAccepted(attemptId, "shared-email", "other");
    expect(mocks.query.mock.calls[0][1]).toEqual(["vakaygo-outreach:other:shared-email"]);
    expect(mocks.query.mock.calls[1][1]).toEqual([attemptId, "shared-email", "other"]);
    mocks.query.mockClear();
    await expect(recordOutreachAccepted("bad-attempt", "shared-email")).rejects.toBeInstanceOf(InvalidOutreachEvent);
    await expect(recordOutreachAccepted(attemptId, "shared/email")).rejects.toBeInstanceOf(InvalidOutreachEvent);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("records recipient-wide opt-out without a provider or automatic unsuppression", async () => {
    await suppressOutreachRecipient(" Business@audit.invalid ", "unsubscribe");
    expect(mocks.query.mock.calls[0][1]).toEqual(["business@audit.invalid", "unsubscribe"]);
    expect(mocks.query.mock.calls[0][0]).toContain("ON CONFLICT(recipient) DO NOTHING");
  });
  it("distinguishes provider polling observations from signed webhook events", async () => {
    const event = parseResendOutreachEvent(payload())!;
    await recordOutreachProviderEvent("poll:provider-email-1:delivered", event, "resend", "provider_poll");
    const [, params] = mocks.query.mock.calls.find(([text]) => text.startsWith("INSERT INTO outreach_email_events"))!;
    expect(params[7]).toBe("provider_poll");
  });
});
