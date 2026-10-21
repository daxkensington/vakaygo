import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { getMailClient } from "@/server/mail-client";

const EMAIL_EVENTS = new Set([
  "email.sent", "email.scheduled", "email.delivered", "email.delivery_delayed",
  "email.bounced", "email.complained", "email.suppressed", "email.failed",
  "email.opened", "email.clicked", "email.unsubscribed",
]);
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EVENT_ID = /^[A-Za-z0-9_.:-]{1,256}$/;
const PROVIDER = /^[a-z][a-z0-9_-]{0,31}$/;
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OutreachSuppressionReason = "bounce" | "complaint" | "provider_suppressed" | "unsubscribe" | "manual";
export type OutreachProviderEvent = {
  providerEmailId: string;
  eventType: string;
  occurredAt: string;
  recipientHash: string;
  bounceType: string | null;
};

export class InvalidOutreachEvent extends Error {
  constructor() { super("Invalid outreach event"); this.name = "InvalidOutreachEvent"; }
}

export function normalizeOutreachRecipient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(email)) return null;
  return email;
}

/** SDK verifies the original bytes, signature version and timestamp tolerance. */
export function verifyResendOutreachWebhook(payload: string, headers: { id: string; timestamp: string; signature: string }, secret: string): unknown {
  return getMailClient().webhooks.verify({ payload, headers, webhookSecret: secret });
}

/** Strip bodies, subject, links and addresses before durable event storage. */
export function parseResendOutreachEvent(payload: unknown, now = new Date()): OutreachProviderEvent | null {
  if (!payload || typeof payload !== "object") throw new InvalidOutreachEvent();
  const p = payload as Record<string, unknown>;
  if (typeof p.type !== "string") throw new InvalidOutreachEvent();
  if (!EMAIL_EVENTS.has(p.type)) return null;
  if (!p.data || typeof p.data !== "object") throw new InvalidOutreachEvent();
  const data = p.data as Record<string, unknown>;
  const recipient = Array.isArray(data.to) && data.to.length === 1 ? normalizeOutreachRecipient(data.to[0]) : null;
  const occurredAt = typeof p.created_at === "string" && /T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(p.created_at) ? new Date(p.created_at) : new Date(NaN);
  if (typeof data.email_id !== "string" || !OPAQUE_ID.test(data.email_id) || !recipient ||
    !Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() < Date.UTC(2000, 0, 1) ||
    occurredAt.getTime() > now.getTime() + 5 * 60_000) throw new InvalidOutreachEvent();
  const bounce = data.bounce && typeof data.bounce === "object" ? (data.bounce as Record<string, unknown>).type : null;
  return {
    providerEmailId: data.email_id,
    eventType: p.type,
    occurredAt: occurredAt.toISOString(),
    recipientHash: createHash("sha256").update(recipient).digest("hex"),
    bounceType: typeof bounce === "string" && /^(permanent|transient|undetermined)$/i.test(bounce) ? bounce.toLowerCase() : null,
  };
}

function validateProvider(provider: string, emailId: string) {
  if (!PROVIDER.test(provider) || !OPAQUE_ID.test(emailId)) throw new InvalidOutreachEvent();
}

export async function recordOutreachAccepted(attemptId: string, providerEmailId: string, provider = "resend"): Promise<boolean> {
  if (!ATTEMPT_ID.test(attemptId)) throw new InvalidOutreachEvent();
  validateProvider(provider, providerEmailId);
  const sql = neon(env.DATABASE_URL);
  const results = await sql.transaction([
    sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`vakaygo-outreach:${provider}:${providerEmailId}`]),
    sql.query(`UPDATE outreach_email_attempts SET state='accepted',provider_email_id=$2,
      accepted_at=coalesce(accepted_at,now()),failed_at=CASE WHEN state='accepted' THEN failed_at ELSE NULL END,error_code=NULL,updated_at=now()
      WHERE id=$1::uuid AND provider=$3 AND state IN ('reserved','uncertain','accepted')
        AND (provider_email_id IS NULL OR provider_email_id=$2) RETURNING id`, [attemptId, providerEmailId, provider]),
    sql.query("SELECT vakaygo_apply_outreach_events($1,$2) AS applied", [provider, providerEmailId]),
  ], { isolationLevel: "ReadCommitted" });
  return results[1].length === 1;
}

/** Unknown network outcomes stay uncertain and must not be blindly resent. */
export async function recordOutreachFailure(attemptId: string, errorCode: string, options: { uncertain?: boolean } = {}): Promise<boolean> {
  if (!ATTEMPT_ID.test(attemptId) || !/^[a-z][a-z0-9_]{0,63}$/.test(errorCode)) throw new InvalidOutreachEvent();
  const sql = neon(env.DATABASE_URL);
  const rows = await sql.query(`UPDATE outreach_email_attempts SET state=$2,error_code=$3,failed_at=now(),updated_at=now()
    WHERE id=$1::uuid AND state IN ('reserved','uncertain') RETURNING id`, [attemptId, options.uncertain === false ? "failed" : "uncertain", errorCode]);
  return rows.length === 1;
}

/** Call only after authenticating the provider webhook's original request bytes. */
export async function recordOutreachProviderEvent(providerEventId: string, event: OutreachProviderEvent, provider = "resend", evidenceSource: "webhook" | "provider_poll" = "webhook") {
  validateProvider(provider, event.providerEmailId);
  if (!EVENT_ID.test(providerEventId) || !EMAIL_EVENTS.has(event.eventType) || !/^[0-9a-f]{64}$/.test(event.recipientHash) ||
    !["webhook", "provider_poll"].includes(evidenceSource)) throw new InvalidOutreachEvent();
  const sql = neon(env.DATABASE_URL);
  const results = await sql.transaction([
    sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`vakaygo-outreach:${provider}:${event.providerEmailId}`]),
    sql.query(`INSERT INTO outreach_email_events(provider,provider_event_id,provider_email_id,event_type,occurred_at,recipient_hash,bounce_type,evidence_source)
      VALUES($1,$2,$3,$4,$5::timestamptz,$6,$7,$8) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING provider_event_id`,
    [provider, providerEventId, event.providerEmailId, event.eventType, event.occurredAt, event.recipientHash, event.bounceType, evidenceSource]),
    sql.query(`SELECT vakaygo_apply_outreach_events(provider,provider_email_id) AS applied FROM outreach_email_events
      WHERE provider=$1 AND provider_event_id=$2 AND provider_email_id=$3 AND recipient_hash=$4`,
    [provider, providerEventId, event.providerEmailId, event.recipientHash]),
  ], { isolationLevel: "ReadCommitted" });
  return { recorded: results[1].length === 1, applied: Number(results[2][0]?.applied || 0) };
}

export async function suppressOutreachRecipient(rawRecipient: string, reason: OutreachSuppressionReason): Promise<void> {
  const recipient = normalizeOutreachRecipient(rawRecipient);
  if (!recipient || !["bounce", "complaint", "provider_suppressed", "unsubscribe", "manual"].includes(reason)) throw new InvalidOutreachEvent();
  const sql = neon(env.DATABASE_URL);
  await sql.query("INSERT INTO outreach_email_suppressions(recipient,reason) VALUES($1,$2) ON CONFLICT(recipient) DO NOTHING", [recipient, reason]);
}
