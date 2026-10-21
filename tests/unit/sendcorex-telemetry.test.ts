// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), event: vi.fn(), verify: vi.fn(), logs: vi.fn(), command: vi.fn(), error: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: mocks.query }) }));
vi.mock("@/lib/env", () => ({ env: new Proxy({}, { get: (_target, key) => process.env[String(key)] }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error } }));
vi.mock("@/server/outreach-tracking", async () => ({ ...await vi.importActual("@/server/outreach-tracking"), recordOutreachProviderEvent: mocks.event }));
vi.mock("@/server/sendcorex-client", async () => ({ ...await vi.importActual("@/server/sendcorex-client"), SendcorexClient: class { verifySetup = mocks.verify; logs = mocks.logs; command = mocks.command; } }));
import { refreshSendcorexTelemetry } from "@/server/sendcorex-telemetry";
import { POST } from "@/app/api/webhooks/sendcorex/route";
const id = "11111111-1111-4111-8111-111111111111", recipient = "business@audit.invalid";
const at = "2026-10-20T12:00:00.000Z", secret = "fixture-secret-with-more-than-thirty-two-characters";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
  vi.stubEnv("SENDCOREX_API_KEY", "fixture-no-network"); vi.stubEnv("SENDCOREX_WEBHOOK_SECRET", secret); vi.stubEnv("SENDCOREX_WEBHOOK_ID", "wh_fixture");
  mocks.verify.mockResolvedValue(undefined);
  mocks.logs.mockResolvedValue([{ id, to: recipient, status: "delivered" }]);
  mocks.command.mockResolvedValue({ events: [], next_cursor: "new", has_more: false });
  mocks.event.mockResolvedValue({ recorded: true, applied: 1 });
  mocks.query.mockImplementation((text: string) => {
    if (text.startsWith("SELECT id,recipient")) return [{ id, recipient, provider_email_id: id }];
    if (text.startsWith("SELECT cursor")) return [{ cursor: "old" }];
    if (text.startsWith("UPDATE outreach_provider_cursors")) return [{ provider: "sendcorex" }];
    return [];
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Sendcorex reconciliation", () => {
  it("checks readiness, binds delivery, and advances only the durable feedback cursor", async () => {
    await refreshSendcorexTelemetry("hello@vakaygo.com");
    expect(mocks.verify).toHaveBeenCalledWith("hello@vakaygo.com", "wh_fixture");
    expect(mocks.logs).toHaveBeenCalledWith([id]);
    expect(mocks.event.mock.calls[0].slice(2)).toEqual(["sendcorex", "provider_poll"]);
    expect(mocks.command).toHaveBeenCalledWith("feedback", "list_feedback", { cursor: "old", limit: 500 });
    expect(mocks.query.mock.calls.find(([q]) => q.startsWith("UPDATE outreach_provider_cursors"))?.[1]).toEqual(["old", "new"]);
  });
  it("fails closed on an unreadable webhook or mismatched recipient", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("fixture"));
    await expect(refreshSendcorexTelemetry("hello@vakaygo.com")).rejects.toThrow();
    expect(mocks.logs).not.toHaveBeenCalled();
    mocks.logs.mockResolvedValueOnce([{ id, to: "wrong@audit.invalid", status: "delivered" }]);
    await expect(refreshSendcorexTelemetry("hello@vakaygo.com")).rejects.toThrow();
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it("never advances feedback after persistence fails", async () => {
    mocks.logs.mockResolvedValue([]);
    mocks.command.mockResolvedValue({ events: [{ email_id: id, recipient, kind: "complaint", at }], next_cursor: "new", has_more: false });
    mocks.event.mockRejectedValueOnce(new Error("fixture persistence"));
    await expect(refreshSendcorexTelemetry("hello@vakaygo.com")).rejects.toThrow();
    expect(mocks.query.mock.calls.some(([q]) => q.startsWith("UPDATE outreach_provider_cursors"))).toBe(false);
  });
  it("holds repeated cursors and concurrent cursor changes", async () => {
    mocks.command.mockResolvedValueOnce({ events: [], next_cursor: "old", has_more: true });
    await expect(refreshSendcorexTelemetry("hello@vakaygo.com")).rejects.toThrow("sendcorex_feedback_incomplete");
    mocks.query.mockImplementation((text: string) => text.startsWith("SELECT cursor") ? [{ cursor: "old" }] : []);
    mocks.logs.mockResolvedValue([]);
    await expect(refreshSendcorexTelemetry("hello@vakaygo.com")).rejects.toThrow("sendcorex_feedback_poll_conflict");
  });
  it("holds unknown feedback without advancing the cursor", async () => {
    mocks.logs.mockResolvedValue([]);
    mocks.command.mockResolvedValue({ events: [{ email_id: id, recipient, kind: "unknown", at }], next_cursor: "new", has_more: false });
    await expect(refreshSendcorexTelemetry("hello@vakaygo.com")).rejects.toThrow();
    expect(mocks.query.mock.calls.some(([q]) => q.startsWith("UPDATE outreach_provider_cursors"))).toBe(false);
  });
  it("accepts the live empty-account null cursor without inventing or skipping a boundary", async () => {
    mocks.query.mockImplementation(() => []);
    mocks.logs.mockResolvedValue([]);
    mocks.command.mockResolvedValue({ events: [], next_cursor: null, has_more: false });
    await expect(refreshSendcorexTelemetry("hello@vakaygo.com")).resolves.toBeUndefined();
    expect(mocks.command).toHaveBeenCalledWith("feedback", "list_feedback", { limit: 500 });
    expect(mocks.query.mock.calls.some(([q]) => q.startsWith("INSERT INTO outreach_provider_cursors") || q.startsWith("UPDATE outreach_provider_cursors"))).toBe(false);
  });
  it("stores hard bounces and complaints, but does not turn a message block into recipient suppression", async () => {
    mocks.logs.mockResolvedValue([]);
    mocks.command.mockResolvedValue({ events: ["bounce_hard", "complaint", "blocked", "bounce_soft"].map(kind => ({ email_id: id, recipient, kind, at })), next_cursor: "new", has_more: false });
    await refreshSendcorexTelemetry("hello@vakaygo.com");
    expect(mocks.event.mock.calls.map(call => call[1].eventType)).toEqual(["email.bounced", "email.complained", "email.failed", "email.failed"]);
    expect(mocks.event.mock.calls.every(call => call[2] === "sendcorex" && call[3] === "provider_poll")).toBe(true);
  });
});

describe("Sendcorex signed route", () => {
  function request(event = "delivered", options: { tamper?: boolean; signature?: string; body?: string } = {}) {
    const raw = options.body ?? JSON.stringify({ event, emailId: id, timestamp: at, data: { recipientEmail: recipient } });
    const signature = options.signature ?? `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    return new Request("https://vakaygo.com/api/webhooks/sendcorex", { method: "POST", body: raw + (options.tamper ? " " : ""), headers: { "x-webhook-signature": signature } });
  }
  it("authenticates original bytes and records only normalized durable evidence", async () => {
    expect((await POST(request("unsubscribe"))).status).toBe(200);
    expect(mocks.event.mock.calls[0][1].eventType).toBe("email.unsubscribed");
    expect(mocks.event.mock.calls[0][2]).toBe("sendcorex");
    expect(JSON.stringify(mocks.event.mock.calls)).not.toContain(recipient);
  });
  it("rejects missing configuration, forged signatures, malformed JSON, and oversized payloads", async () => {
    vi.stubEnv("SENDCOREX_WEBHOOK_SECRET", ""); expect((await POST(request())).status).toBe(503);
    vi.stubEnv("SENDCOREX_WEBHOOK_SECRET", secret);
    expect((await POST(request("delivered", { tamper: true }))).status).toBe(401);
    expect((await POST(request("delivered", { signature: "bad" }))).status).toBe(401);
    expect((await POST(request("delivered", { body: "{" }))).status).toBe(400);
    expect((await POST(request("delivered", { body: "x".repeat(65_537) }))).status).toBe(413);
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it("returns a retryable failure without leaking persistence details", async () => {
    mocks.event.mockRejectedValueOnce(new Error("private database details"));
    const result = await POST(request()); expect(result.status).toBe(500);
    expect(await result.text()).not.toContain("private"); expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("private");
  });
});
