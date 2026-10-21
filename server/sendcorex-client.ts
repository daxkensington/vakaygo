import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { InvalidOutreachEvent, normalizeOutreachRecipient, type OutreachProviderEvent } from "@/server/outreach-tracking";

const EMAIL_ID = /^[A-Za-z0-9_-]{1,128}$/;
export class SendcorexError extends Error {
  constructor(readonly code: string, readonly uncertain = true) { super(code); this.name = "SendcorexError"; }
}
type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SendcorexError("sendcorex_response_invalid");
  return value as Json;
}

/** Fixed HTTPS origins, no redirect, retry, quarantine release or SMTP fallback. */
export class SendcorexClient {
  constructor(private readonly key: string, private readonly signal: AbortSignal, private readonly fetcher: typeof fetch = fetch) {
    if (!key || /[\r\n]/.test(key)) throw new SendcorexError("sendcorex_unconfigured", false);
  }
  private async request(url: string, body?: unknown): Promise<Json> {
    let response: Response;
    try { response = await this.fetcher(url, { method: body === undefined ? "GET" : "POST", redirect: "error", signal: this.signal,
      headers: { Authorization: this.key, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { throw new SendcorexError("sendcorex_transport_unconfirmed"); }
    if (!response.ok) throw new SendcorexError("sendcorex_request_rejected", response.status >= 500 || response.status === 409);
    try { return object(await response.json()); }
    catch { throw new SendcorexError("sendcorex_response_invalid"); }
  }
  async command(route: "domain" | "logs" | "feedback", command: string, args: Json = {}): Promise<Json> {
    const result = await this.request(`https://g.sendcorex.com/v1/${route}`, { commands: [{ command, args }] });
    if (result.type !== "SUCCESS" || !Array.isArray(result.results) || result.results.length !== 1) throw new SendcorexError("sendcorex_command_invalid");
    const item = object(result.results[0]);
    if (item.type !== "SUCCESS" || item.command !== command) throw new SendcorexError("sendcorex_command_rejected");
    return object(item.data);
  }
  async verifySetup(from: string, webhookId: string): Promise<void> {
    const domain = from.split("@")[1]?.toLowerCase();
    const result = await this.command("domain", "list_domains");
    if (!Array.isArray(result.domains) || !result.domains.some(value => {
      const d = object(value);
      return d.domain === domain && d.validated === true && d.has_dkim === true && d.has_spf === true && d.has_dmarc === true && d.has_return_path === true && d.dkim_key_size === 2048 && d.dkim_deprecated === false;
    })) throw new SendcorexError("sendcorex_domain_unverified");
    // Current vendor reference documents this read-only endpoint. Failure or
    // missing scope holds sending; do not substitute an undocumented endpoint.
    const hooks = await this.request("https://graph.sendcorex.com/v3.0/webhooks");
    if (hooks.success !== true || !Array.isArray(hooks.webhooks) || !hooks.webhooks.some(value => {
      const h = object(value);
      return h.id === webhookId && h.webhookUrl === "https://vakaygo.com/api/webhooks/sendcorex" && h.isActive === true && h.events === null && h.failed === 0;
    })) throw new SendcorexError("sendcorex_webhook_unverified");
  }
  async send(input: { from: string; to: string; subject: string; html: string; unsubscribe: string }): Promise<string> {
    const to = normalizeOutreachRecipient(input.to);
    let url: URL;
    try { url = new URL(input.unsubscribe); } catch { throw new SendcorexError("sendcorex_invalid_unsubscribe", false); }
    if (!to || !/^[a-z0-9._%+-]+@vakaygo\.com$/i.test(input.from) || url.protocol !== "https:" || url.hostname !== "vakaygo.com" || url.username || url.password || /[\r\n<>]/.test(input.unsubscribe)) throw new SendcorexError("sendcorex_invalid_envelope", false);
    const result = await this.request("https://mail.sendcorex.com/v3.0/send", {
      from: input.from, to, replyTo: "support@vakaygo.com", senderName: "Vakaygo", subject: input.subject, body: input.html, transactional: false,
      headers: { "List-Unsubscribe": `<${input.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (result.success !== true || result.code !== "EMAIL_QUEUED_SUCCESS" || typeof result.id !== "string" || !EMAIL_ID.test(result.id) ||
      result.recipients !== 1 || !Array.isArray(result.ids) || result.ids.length !== 1) throw new SendcorexError("sendcorex_acceptance_unconfirmed");
    const only = object(result.ids[0]);
    if (only.id !== result.id || normalizeOutreachRecipient(only.recipient) !== to) throw new SendcorexError("sendcorex_acceptance_unconfirmed");
    return result.id;
  }
  async logs(ids: string[]): Promise<Json[]> {
    if (ids.length > 50 || ids.some(id => !EMAIL_ID.test(id))) throw new SendcorexError("sendcorex_invalid_ids");
    if (!ids.length) return [];
    const result = await this.command("logs", "get_logs", { ids });
    if (!Array.isArray(result.logs) || result.partial === true || result.logs.length > ids.length) throw new SendcorexError("sendcorex_logs_incomplete");
    const logs = result.logs.map(object), seen = new Set<string>();
    for (const log of logs) {
      if (typeof log.id !== "string" || !ids.includes(log.id) || seen.has(log.id)) throw new SendcorexError("sendcorex_logs_mismatch");
      seen.add(log.id);
    }
    return logs;
  }
}

export function sendcorexEvidence(emailId: unknown, recipient: unknown, type: string, at: unknown, bounceType: string | null = null): OutreachProviderEvent {
  const email = normalizeOutreachRecipient(recipient);
  const occurredAt = typeof at === "string" && /T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(at) ? new Date(at) : new Date(NaN);
  if (typeof emailId !== "string" || !EMAIL_ID.test(emailId) || !email || !Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() < Date.UTC(2000, 0, 1) || occurredAt.getTime() > Date.now() + 300_000) throw new InvalidOutreachEvent();
  return { providerEmailId: emailId, recipientHash: createHash("sha256").update(email).digest("hex"), eventType: type, occurredAt: occurredAt.toISOString(), bounceType };
}

export function parseSendcorexLog(log: Json, recipient: string, now = new Date()): OutreachProviderEvent {
  if (normalizeOutreachRecipient(log.to) !== recipient) throw new InvalidOutreachEvent();
  const types: Record<string, string> = { delivered: "email.delivered", bounced: "email.bounced", spam: "email.failed", rate_limited: "email.failed" };
  const type = types[String(log.status)];
  if (!type) throw new InvalidOutreachEvent();
  // Polling is an observation, not an invented historical delivery timestamp.
  return sendcorexEvidence(log.id, log.to, type, now.toISOString());
}

export function parseSendcorexFeedback(value: unknown): OutreachProviderEvent {
  const event = object(value);
  const types: Record<string, string> = { bounce_hard: "email.bounced", bounce_soft: "email.failed", complaint: "email.complained", blocked: "email.failed", dropped: "email.failed" };
  const type = types[String(event.kind)];
  if (!type) throw new InvalidOutreachEvent();
  return sendcorexEvidence(event.email_id, event.recipient, type, event.at, event.kind === "bounce_hard" ? "permanent" : null);
}

export function verifySendcorexWebhook(raw: string, signature: string | null, secret: string): void {
  if (secret.length < 32 || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) throw new InvalidOutreachEvent();
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new InvalidOutreachEvent();
}

export function parseSendcorexWebhook(value: unknown): OutreachProviderEvent | null {
  const p = object(value), data = object(p.data);
  const types: Record<string, string> = { queued: "email.sent", delivered: "email.delivered", bounced: "email.bounced", spam: "email.failed", retrying: "email.delivery_delayed", failed: "email.failed", return_path: "email.failed", fbl_complaint: "email.complained", unsubscribe: "email.unsubscribed" };
  if (typeof p.event !== "string") throw new InvalidOutreachEvent();
  const type = types[p.event];
  if (!type) return null;
  return sendcorexEvidence(p.emailId, data.recipientEmail, type, p.timestamp);
}

export function sendcorexEventId(event: OutreachProviderEvent): string {
  return `sc_${createHash("sha256").update(JSON.stringify(event)).digest("hex")}`;
}
