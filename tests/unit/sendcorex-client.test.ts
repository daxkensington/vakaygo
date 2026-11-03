// @vitest-environment node
import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendcorexClient, SendcorexError, parseSendcorexFeedback, parseSendcorexLog, parseSendcorexWebhook, sendcorexEventId, verifySendcorexWebhook } from "@/server/sendcorex-client";

const recipient = "business@audit.invalid", id = "11111111-1111-4111-8111-111111111111";
const input = { from: "hello@vakaygo.com", to: recipient, subject: "Fixture", html: "<p>Fixture</p>", unsubscribe: "https://vakaygo.com/api/outreach/unsubscribe?token=fixture" };
const queued = { success: true, code: "EMAIL_QUEUED_SUCCESS", id, ids: [{ id, recipient }], recipients: 1 };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const command = (name: string, data: unknown) => ({ type: "SUCCESS", results: [{ command: name, type: "SUCCESS", data }] });
const hash = createHash("sha256").update(recipient).digest("hex");
afterEach(() => vi.useRealTimers());

describe("Sendcorex transport", () => {
  it("uses one marketing send, bound identity, HTTPS and one-click unsubscribe headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(queued));
    const client = new SendcorexClient("fixture-secret", AbortSignal.timeout(1000), fetcher);
    expect(await client.send(input)).toBe(id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://mail.sendcorex.com/v3.0/send");
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBe("fixture-secret");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ to: recipient, from: "hello@vakaygo.com", senderName: "Vakaygo", replyTo: "support@vakaygo.com", transactional: false });
    expect(body.headers).toEqual({ "List-Unsubscribe": `<${input.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(body.cc).toBeUndefined(); expect(body.bcc).toBeUndefined();
  });
  it.each(["https://wrong.invalid/u", "http://vakaygo.com/u", "https://user:pass@vakaygo.com/u", "https://vakaygo.com/u\r\nHeader:x"])("rejects unsafe unsubscribe %s before a request", async unsubscribe => {
    const fetcher = vi.fn();
    await expect(new SendcorexClient("fixture", AbortSignal.timeout(1000), fetcher).send({ ...input, unsubscribe })).rejects.toMatchObject({ uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([400, 403, 409, 429, 500, 502, 503])("never retries HTTP %s or leaks raw errors", async status => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: "private upstream credential" }, status));
    const result = await new SendcorexClient("fixture", AbortSignal.timeout(1000), fetcher).send(input).catch(e => e);
    expect(result).toBeInstanceOf(SendcorexError);
    expect(result.uncertain).toBe(status >= 500 || status === 409);
    expect(result.message).not.toContain("private"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...queued, success: false }, { ...queued, code: "OTHER" }, { ...queued, id: 7 }, { ...queued, recipients: 2 },
    { ...queued, ids: [{ id, recipient: "wrong@audit.invalid" }] }, { ...queued, ids: [{ id: "other", recipient }] },
    { ...queued, ids: [] }, { ...queued, ids: [{ id, recipient }, { id, recipient }] },
  ])("holds malformed or mismatched acceptance", async body => {
    const fetcher = vi.fn().mockResolvedValue(response(body));
    await expect(new SendcorexClient("fixture", AbortSignal.timeout(1000), fetcher).send(input)).rejects.toMatchObject({ uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("holds transport and malformed JSON responses without retries", async () => {
    for (const fetcher of [vi.fn().mockRejectedValue(new Error("private")), vi.fn().mockResolvedValue(new Response("gateway"))]) {
      await expect(new SendcorexClient("fixture", AbortSignal.timeout(1000), fetcher).send(input)).rejects.toMatchObject({ uncertain: true });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects HTTP-200 command errors and partial log observations", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ type: "SUCCESS", results: [{ command: "get_logs", type: "ERROR", code: "MISSING_SCOPE" }] }));
    const client = new SendcorexClient("fixture", AbortSignal.timeout(1000), fetcher);
    await expect(client.logs([id])).rejects.toThrow("sendcorex_command_rejected");
    fetcher.mockResolvedValue(response(command("get_logs", { logs: [{ id, to: recipient }], partial: true })));
    await expect(client.logs([id])).rejects.toThrow("sendcorex_logs_incomplete");
    fetcher.mockResolvedValue(response(command("get_logs", { logs: [{ id: "wrong", to: recipient }] })));
    await expect(client.logs([id])).rejects.toThrow("sendcorex_logs_mismatch");
  });
  it("checks the exact domain and active all-event webhook, without requiring root MX changes", async () => {
    const domain = { domain: "vakaygo.com", validated: true, has_dkim: true, has_spf: true, has_dmarc: true, has_return_path: true, has_mx: false, dkim_key_size: 2048, dkim_deprecated: false };
    const hook = { id: "wh_fixture", webhookUrl: "https://vakaygo.com/api/webhooks/sendcorex", isActive: true, events: null, failed: 0 };
    const fetcher = vi.fn().mockResolvedValueOnce(response(command("list_domains", { domains: [domain] }))).mockResolvedValueOnce(response({ success: true, webhooks: [hook] }));
    await expect(new SendcorexClient("fixture", AbortSignal.timeout(1000), fetcher).verifySetup(input.from, "wh_fixture")).resolves.toBeUndefined();
    for (const change of [{ isActive: false }, { webhookUrl: "https://wrong.invalid" }, { id: "wrong" }, { events: ["delivered"] }, { failed: 1 }]) {
      fetcher.mockResolvedValueOnce(response(command("list_domains", { domains: [domain] }))).mockResolvedValueOnce(response({ success: true, webhooks: [{ ...hook, ...change }] }));
      await expect(new SendcorexClient("fixture", AbortSignal.timeout(1000), fetcher).verifySetup(input.from, "wh_fixture")).rejects.toThrow("sendcorex_webhook_unverified");
    }
  });
});

describe("Sendcorex delivery evidence", () => {
  const timestamp = "2026-10-21T06:00:00.000Z";
  it("verifies raw HMAC bytes and rejects changes, short secrets and malformed signatures", () => {
    const secret = "fixture-secret-of-at-least-thirty-two-characters", raw = '{"event":"delivered"}';
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(() => verifySendcorexWebhook(raw, signature, secret)).not.toThrow();
    for (const [body, sig, key] of [[raw + " ", signature, secret], [raw, signature, "short"], [raw, "sha256=bad", secret], [raw, null, secret]] as const) expect(() => verifySendcorexWebhook(body, sig, key)).toThrow();
  });
  it.each([['bounce_hard', 'email.bounced'], ['bounce_soft', 'email.failed'], ['blocked', 'email.failed'], ['dropped', 'email.failed'], ['complaint', 'email.complained']])("maps %s without inventing a complaint or suppressing a temporary failure", (kind, type) => {
    expect(parseSendcorexFeedback({ email_id: id, recipient, at: timestamp, kind, diagnostic: "private body" })).toMatchObject({ providerEmailId: id, recipientHash: hash, eventType: type });
  });
  it("binds polling to the expected recipient and stores observation time", () => {
    const now = new Date(timestamp);
    expect(parseSendcorexLog({ id, to: recipient, status: "delivered", sent_at: "2026-10-20T00:00:00Z" }, recipient, now)).toMatchObject({ occurredAt: timestamp, eventType: "email.delivered" });
    expect(() => parseSendcorexLog({ id, to: "wrong@audit.invalid", status: "delivered" }, recipient)).toThrow();
    expect(() => parseSendcorexLog({ id, to: recipient, status: "queued" }, recipient)).toThrow();
  });
  it.each(["bounced", "spam"])("holds a generic %s log without inferring a hard bounce or complaint", status => {
    expect(parseSendcorexLog({ id, to: recipient, status }, recipient).eventType).toBe("email.failed");
  });
  it("records unsubscribe and stable bounded event identity while stripping private content", () => {
    const event = parseSendcorexWebhook({ event: "unsubscribe", emailId: id, timestamp, data: { recipientEmail: recipient, private: "secret body" } })!;
    expect(event.eventType).toBe("email.unsubscribed"); expect(event.recipientHash).toBe(hash);
    expect(JSON.stringify(event)).not.toContain(recipient); expect(JSON.stringify(event)).not.toContain("secret body");
    expect(sendcorexEventId(event)).toBe(sendcorexEventId({ ...event }));
  });
  it("rejects invalid identifiers, dates, recipients and future events", () => {
    for (const change of [{ emailId: "bad/id" }, { timestamp: "yesterday" }, { timestamp: "2099-01-01T00:00:00Z" }, { data: { recipientEmail: "invalid" } }]) {
      expect(() => parseSendcorexWebhook({ event: "delivered", emailId: id, timestamp, data: { recipientEmail: recipient }, ...change })).toThrow();
    }
  });
});
