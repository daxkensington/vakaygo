import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";

export const OUTREACH_CONTEXT_COOKIE = "vg_claim_context";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGIN = "https://vakaygo.com";
type Context = { purpose: "claim" | "unsubscribe"; attemptId: string; listingId?: string; expires?: number };
function signature(value: string) {
  if (env.AUTH_SECRET.length < 32) throw new Error("Attribution signing unavailable");
  return createHmac("sha256", env.AUTH_SECRET).update(`outreach-v2:${value}`).digest("base64url");
}
function encode(context: Context) {
  const encoded = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}
export function decodeOutreachContext(value: string, purpose: Context["purpose"], now = new Date()): Context | null {
  if (value.length > 600) return null;
  const [encoded, supplied, extra] = value.split(".");
  if (!encoded || !supplied || extra || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) return null;
  const expected = signature(encoded);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Context;
    if (parsed.purpose !== purpose || !UUID.test(parsed.attemptId)) return null;
    if (purpose === "claim" && (!parsed.listingId || !UUID.test(parsed.listingId) || !Number.isInteger(parsed.expires) || parsed.expires! <= now.getTime() / 1000 || parsed.expires! > now.getTime() / 1000 + 31 * 86400)) return null;
    return parsed;
  } catch { return null; }
}
export function claimInvitationUrl(attemptId: string, listingId: string) {
  if (!UUID.test(attemptId) || !UUID.test(listingId)) throw new Error("Invalid claim context");
  return `${ORIGIN}/api/outreach/claim?context=${encode({ purpose: "claim", attemptId, listingId, expires: Math.floor(Date.now() / 1000) + 30 * 86400 })}`;
}
export function unsubscribeInvitationUrl(attemptId: string) {
  if (!UUID.test(attemptId)) throw new Error("Invalid unsubscribe context");
  // An opt-out does not expire. It grants no account or listing authority.
  return `${ORIGIN}/api/outreach/unsubscribe?context=${encode({ purpose: "unsubscribe", attemptId })}`;
}

export async function recordClaimInvitationVisit(context: Context) {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql.query(`INSERT INTO outreach_claim_attributions(attempt_id,listing_id)
    SELECT id,listing_id FROM outreach_email_attempts WHERE id=$1::uuid AND listing_id=$2::uuid AND state='accepted'
      AND accepted_at<=now() AND reserved_at>=now()-interval '30 days'
    ON CONFLICT(attempt_id) DO UPDATE SET last_visited_at=now() RETURNING listing_id`, [context.attemptId, context.listingId]);
  return rows.length === 1;
}

/** Called after normal authenticated ownership verification, never instead of it. */
export async function recordApprovedOutreachClaim(request: Request, listingId: string, userId: string) {
  const raw = (request.headers.get("cookie") || "").split(";").map(value => value.trim()).find(value => value.startsWith(`${OUTREACH_CONTEXT_COOKIE}=`))?.slice(OUTREACH_CONTEXT_COOKIE.length + 1);
  if (!raw) return;
  const context = decodeOutreachContext(raw, "claim");
  if (!context || context.listingId !== listingId) return;
  const sql = neon(env.DATABASE_URL);
  await sql.query(`UPDATE outreach_claim_attributions x SET claim_id=c.id,claimed_at=now(),operator_id=$3::uuid
    FROM outreach_email_attempts a,listing_claims c,listings l,users u
    WHERE x.attempt_id=$1::uuid AND x.listing_id=$2::uuid AND x.claimed_at IS NULL
      AND a.id=x.attempt_id AND a.listing_id=x.listing_id AND a.state='accepted'
      AND c.listing_id=x.listing_id AND c.operator_id=$3::uuid AND c.status='approved'
      AND (c.created_at AT TIME ZONE 'UTC')>=a.accepted_at
      AND l.id=x.listing_id AND l.operator_id=$3::uuid AND vakaygo_listing_claim_verified(l.id)
      AND u.id=$3::uuid AND u.email_verified=true`, [context.attemptId, listingId, userId]);
}

export async function unsubscribeInvitation(context: Context) {
  const sql = neon(env.DATABASE_URL);
  const result = await sql.transaction(tx => [
    tx.query("SELECT pg_advisory_xact_lock(hashtextextended('vakaygo-outreach-campaign',0))"),
    tx.query(`WITH target AS (SELECT recipient,listing_id FROM outreach_email_attempts WHERE id=$1::uuid),
      blocked AS (INSERT INTO outreach_email_suppressions(recipient,reason) SELECT recipient,'unsubscribe' FROM target
       ON CONFLICT(recipient) DO NOTHING RETURNING recipient),
      revoked AS (UPDATE outreach_recipient_consents p SET revoked_at=coalesce(revoked_at,now()),revocation_reason=coalesce(revocation_reason,'recipient_unsubscribe')
       WHERE p.recipient_email IN (SELECT recipient FROM target) AND p.revoked_at IS NULL RETURNING id)
      INSERT INTO business_outreach(listing_id,status,notes)
      SELECT listing_id,'do_not_contact','Recipient unsubscribed from campaign emails.' FROM target WHERE listing_id IS NOT NULL
      ON CONFLICT(listing_id) DO UPDATE SET status='do_not_contact',updated_at=now()
      RETURNING listing_id`, [context.attemptId]),
    tx.query("SELECT id FROM outreach_email_attempts WHERE id=$1::uuid", [context.attemptId]),
  ], { isolationLevel: "ReadCommitted" });
  return result[2].length > 0;
}
