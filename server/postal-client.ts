import { createHash, createPublicKey, constants, verify } from "node:crypto";

/**
 * Unwired, server-only foundation for Postal 3.3.7, source d038eaa8c763d3cafa797ccd6f773d53470bd336.
 * Contract: app/controllers/legacy_api/{send,messages}_controller.rb,
 * app/models/outgoing_message_prototype.rb, app/services/webhook_delivery_service.rb,
 * lib/postal/{http,signer}.rb at https://github.com/postalserver/postal/tree/3.3.7.
 * Callers must first persist a unique reservation and recheck all campaign gates.
 * Postal has no proven request idempotency contract: never automatically resubmit
 * an uncertain send, even with the same tag or Message-ID. This module has no DB,
 * environment reads, provider-selection side effects, public route or retry loop.
 */
export const POSTAL_ORIGIN = "https://postal.vakaygo.com";
const FROM = "hello@vakaygo.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9]{16}$/;
const FRESH_MS = 20 * 60_000;
const MAX_RESPONSE_BYTES = 32_768;

export type PostalConfig = Readonly<{
  origin: string;
  apiKey: string;
  /** Timestamp of an independent DNS/TLS/domain/queue/feedback readiness check.
   * This is a freshness guard, not an alternative to performing those checks. */
  verifiedAt: number;
}>;
export type PostalInvitation = Readonly<{
  attemptId: string;
  reservedAt: number;
  recipient: string;
  subject: string;
  text: string;
  html?: string;
  unsubscribeUrl: string;
}>;
export type PostalAcceptance = Readonly<{
  attemptId: string;
  recipient: string;
  id: number;
  token: string;
  messageId: string;
}>;
type SendResult =
  | { state: "accepted"; acceptance: PostalAcceptance }
  | { state: "rejected"; reason: "invalid_config" | "invalid_invitation" | "provider_rejected" }
  | { state: "uncertain"; reason: "provider_unavailable" | "invalid_provider_response" };
type PollResult =
  | { state: "observed"; status: "Pending" | "Sent" | "SoftFail" | "HardFail" | "Held" | "Bounced"; lastAttemptAt: number | null }
  | { state: "unavailable"; reason: "invalid_config" | "invalid_acceptance" | "provider_unavailable" | "invalid_provider_response" };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function fresh(timestamp: number, now: number): boolean {
  return Number.isFinite(timestamp) && Number.isFinite(now) && timestamp <= now && timestamp > now - FRESH_MS;
}
function configValid(config: PostalConfig, now: number): boolean {
  // Exact origin comparison also rejects credentials, IP literals, alternate
  // ports, paths, query strings and redirects to internal services.
  return config.origin === POSTAL_ORIGIN && typeof config.apiKey === "string"
    && /^[A-Za-z0-9_-]{20,256}$/.test(config.apiKey) && fresh(config.verifiedAt, now);
}
function recipientValid(value: unknown): value is string {
  // Deliberately restricted bare ASCII mailbox; never parse display names,
  // multiple recipients, quoted local parts or CRLF as delivery addresses.
  if (typeof value !== "string" || value.length > 254 || value !== value.toLowerCase()) return false;
  const [local, domain, extra] = value.split("@");
  return extra === undefined && !!local && local.length <= 64
    && /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)
    && !!domain && domain.length <= 253 && domain.includes(".")
    && domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
function messageIdValid(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/.test(value);
}
function invitationValid(input: PostalInvitation, now: number): boolean {
  const keys = ["attemptId", "reservedAt", "recipient", "subject", "text", "html", "unsubscribeUrl"];
  if (!record(input) || Object.keys(input).some(key => !keys.includes(key)) || !UUID.test(input.attemptId)
    || !fresh(input.reservedAt, now) || !recipientValid(input.recipient)
    || typeof input.subject !== "string" || !input.subject.trim() || input.subject.length > 200 || /[\r\n\0]/.test(input.subject)
    || typeof input.text !== "string" || !input.text.trim() || input.text.length > 64_000
    || (input.html !== undefined && (typeof input.html !== "string" || input.html.length > 128_000))) return false;
  try {
    const url = new URL(input.unsubscribeUrl);
    return url.origin === "https://vakaygo.com" && !url.username && !url.password && !url.hash
      && url.pathname === "/api/outreach/unsubscribe" && url.searchParams.size === 1
      && /^[A-Za-z0-9_.-]{20,2000}$/.test(url.searchParams.get("context") || "");
  } catch { return false; }
}
function acceptanceValid(value: PostalAcceptance): boolean {
  return record(value) && UUID.test(value.attemptId) && recipientValid(value.recipient)
    && Number.isSafeInteger(value.id) && value.id > 0 && TOKEN.test(value.token) && messageIdValid(value.messageId);
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error("provider_unavailable");
  // Do not buffer arbitrary server/error pages or log their possibly sensitive contents.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("invalid_provider_response");
      chunks.push(item.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); }
}

export function createPostalClient(configuration: PostalConfig, clock: () => number = Date.now) {
  const config = Object.freeze({ ...configuration });
  async function request(path: "/send/message" | "/messages/message", body: unknown) {
    const response = await fetch(`${POSTAL_ORIGIN}/api/v1${path}`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "X-Server-API-Key": config.apiKey },
      body: JSON.stringify(body),
    });
    return responseJson(response);
  }
  return Object.freeze({
    async send(invitation: PostalInvitation): Promise<SendResult> {
      const input = Object.freeze({ ...invitation });
      const now = clock();
      if (!configValid(config, now)) return { state: "rejected", reason: "invalid_config" };
      if (!invitationValid(input, now)) return { state: "rejected", reason: "invalid_invitation" };
      try {
        const body = await request("/send/message", {
          to: [input.recipient], from: FROM, reply_to: "support@vakaygo.com",
          subject: input.subject, plain_body: input.text, ...(input.html !== undefined ? { html_body: input.html } : {}),
          tag: `outreach:${input.attemptId}`,
          headers: { "X-VakayGo-Attempt-ID": input.attemptId,
            "List-Unsubscribe": `<${input.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        // Known errors emitted before create_messages in the pinned API. An
        // arbitrary HTTP 4xx/5xx, malformed success or unknown error is ambiguous.
        if (record(body) && body.status === "error" && record(body.data)
          && ["AccessDenied", "InvalidServerAPIKey", "ServerSuspended", "NoRecipients", "NoContent", "FromAddressMissing", "UnauthenticatedFromAddress"].includes(String(body.data.code))) {
          return { state: "rejected", reason: "provider_rejected" };
        }
        if (!record(body) || body.status !== "success" || !record(body.data) || !record(body.data.messages)
          || Object.keys(body.data.messages).length !== 1 || !messageIdValid(body.data.message_id)) {
          return { state: "uncertain", reason: "invalid_provider_response" };
        }
        const message = body.data.messages[input.recipient];
        if (!record(message) || typeof message.id !== "number" || typeof message.token !== "string") return { state: "uncertain", reason: "invalid_provider_response" };
        const acceptance = Object.freeze({ attemptId: input.attemptId, recipient: input.recipient,
          id: message.id, token: message.token, messageId: body.data.message_id });
        return acceptanceValid(acceptance) ? { state: "accepted", acceptance } : { state: "uncertain", reason: "invalid_provider_response" };
      } catch { return { state: "uncertain", reason: "provider_unavailable" }; }
    },
    async poll(observed: PostalAcceptance): Promise<PollResult> {
      const acceptance = Object.freeze({ ...observed });
      if (!configValid(config, clock())) return { state: "unavailable", reason: "invalid_config" };
      if (!acceptanceValid(acceptance)) return { state: "unavailable", reason: "invalid_acceptance" };
      try {
        // Postal calls this GET Message, but its v1 contract uses HTTP POST.
        const body = await request("/messages/message", { id: acceptance.id, _expansions: ["status", "details"] });
        if (!record(body) || body.status !== "success" || !record(body.data)) return { state: "unavailable", reason: "invalid_provider_response" };
        const { data } = body;
        // details.mail_from is the stored API sender (OutgoingMessagePrototype).
        // SMTPSender independently uses token@return-path-domain on the wire;
        // that bounce envelope does not replace this stored identity field.
        if (data.id !== acceptance.id || data.token !== acceptance.token || !record(data.details) || !record(data.status)
          || data.details.rcpt_to !== acceptance.recipient || data.details.mail_from !== FROM
          || data.details.message_id !== acceptance.messageId || data.details.tag !== `outreach:${acceptance.attemptId}`
          || data.details.direction !== "outgoing" || data.details.bounce !== false
          || !["Pending", "Sent", "SoftFail", "HardFail", "Held", "Bounced"].includes(String(data.status.status))) {
          return { state: "unavailable", reason: "invalid_provider_response" };
        }
        const last = data.status.last_delivery_attempt;
        if (last !== null && (typeof last !== "number" || !Number.isFinite(last) || last <= 0 || last * 1000 > clock() + 60_000)) return { state: "unavailable", reason: "invalid_provider_response" };
        // Sent means the next SMTP server accepted it, never proof of inbox placement.
        return { state: "observed", status: data.status.status as Extract<PollResult, { state: "observed" }>["status"], lastAttemptAt: last === null ? null : (last as number) * 1000 };
      } catch { return { state: "unavailable", reason: "provider_unavailable" }; }
    },
  });
}

/** Authenticity only. Future ingestion must durably deduplicate uuid AND bind
 * payload message/recipient/tag to an existing attempt before updating anything.
 * No public route or complaint event is implied; Postal's event list has no ARF
 * complaint event. Never download a verification key from a request/KID header.
 */
export function verifyPostalWebhook(raw: Uint8Array, signature256: string, pin: Readonly<{
  publicKeyPem: string; spkiSha256: string;
}>, now = Date.now()): Readonly<{ uuid: string; event: string; timestamp: number; payload: Record<string, unknown> }> | null {
  try {
    if (!raw.length || raw.length > MAX_RESPONSE_BYTES || signature256.length > 2048 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature256)) return null;
    const key = createPublicKey(pin.publicKeyPem);
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048
      || !/^[a-f0-9]{64}$/.test(pin.spkiSha256)
      || createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex") !== pin.spkiSha256) return null;
    const signature = Buffer.from(signature256, "base64");
    if (signature.toString("base64") !== signature256 || !verify("RSA-SHA256", raw, { key, padding: constants.RSA_PKCS1_PADDING }, signature)) return null;
    const body: unknown = JSON.parse(Buffer.from(raw).toString("utf8"));
    if (!record(body) || !UUID.test(String(body.uuid)) || typeof body.timestamp !== "number" || !Number.isFinite(body.timestamp)
      || !Number.isFinite(now) || body.timestamp * 1000 < now - 60 * 60_000 || body.timestamp * 1000 > now + 60_000
      || !["MessageSent", "MessageDelayed", "MessageDeliveryFailed", "MessageHeld", "MessageBounced", "MessageLinkClicked", "MessageLoaded", "DomainDNSError"].includes(String(body.event))
      || !record(body.payload)) return null;
    return Object.freeze({ uuid: body.uuid as string, event: body.event as string, timestamp: body.timestamp, payload: body.payload });
  } catch { return null; }
}
