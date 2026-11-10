import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { safeAuthNext } from "@/lib/auth-return";
import { establishEmailIdentity, type EmailIdentity } from "@/server/email-identity";

/**
 * Setup links: the button in an onboarding reminder signs the business in.
 *
 * Reminder emails go to operators who have been away for weeks; their 7-day
 * session is long gone, so every reminder used to end at a password prompt.
 * A reminder is sent to the account's own verified address, which is the same
 * proof a "email me a sign-in link" request relies on, so the button may
 * carry that proof itself. The limits, all enforced on the server:
 *
 * - one link per reminder row, usable ONCE (`signin_used_at`, migration 0022);
 * - it expires SETUP_LINK_TTL_MS after the reminder was sent;
 * - it is bound to the operator, the account's session version (a password
 *   change or "sign out everywhere" kills it) and the destination path;
 * - the account's address must still be the address the reminder went to;
 * - operator accounts only, never an administrator; an account with
 *   two-factor authentication is sent to the normal sign-in instead;
 * - the listing must still belong to that operator;
 * - a GET never signs anyone in: the page asks for a click and POSTs, so
 *   mail scanners that open links cannot use the link up or be signed in.
 *
 * On a database without migration 0022 no setup link is ever issued and the
 * reminder carries the plain page link, as before.
 */

export const SETUP_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only pages inside the operator area can be a setup-link destination. */
export function setupLinkDestination(value: unknown): string | null {
  const next = safeAuthNext(value);
  if (!next) return null;
  const pathname = next.split(/[?#]/, 1)[0];
  return pathname === "/operator" || pathname.startsWith("/operator/") ? next : null;
}

type SignedFields = { nudgeId: string; operatorId: string; sessionVersion: number; expiresAt: number; next: string };

function signature(fields: SignedFields): string {
  if (env.AUTH_SECRET.length < 32) throw new Error("Setup link signing unavailable");
  return createHmac("sha256", env.AUTH_SECRET)
    .update(["operator-setup-link-v1", fields.nudgeId.toLowerCase(), fields.operatorId.toLowerCase(), String(fields.sessionVersion), String(fields.expiresAt), fields.next].join("|"))
    .digest("base64url");
}

/** `<reminder id>.<expiry, epoch seconds>.<signature>`; null when the destination is not an operator page. */
export function createSetupLinkToken(input: { nudgeId: string; operatorId: string; sessionVersion: number; sentAt: Date; next: string }): string | null {
  const next = setupLinkDestination(input.next);
  if (!next || !UUID.test(input.nudgeId) || !UUID.test(input.operatorId) || !Number.isInteger(input.sessionVersion)) return null;
  const expiresAt = Math.floor((input.sentAt.getTime() + SETUP_LINK_TTL_MS) / 1000);
  if (!Number.isFinite(expiresAt)) return null;
  return `${input.nudgeId.toLowerCase()}.${expiresAt}.${signature({ nudgeId: input.nudgeId, operatorId: input.operatorId, sessionVersion: input.sessionVersion, expiresAt, next })}`;
}

export function setupLinkUrl(origin: string, token: string, next: string): string {
  return `${origin}/auth/setup-link?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
}

export type SetupLinkFailure = "invalid" | "expired" | "used" | "use_password" | "unavailable";
export type SetupLinkResult =
  | { ok: true; identity: EmailIdentity; redirect: string }
  | { ok: false; reason: SetupLinkFailure };

type LinkRow = {
  id: string; operator_id: string; recipient: string; sent_at: string; signin_used_at: string | null;
  email: string; role: string; session_version: number; totp_enabled: boolean; owns_listing: boolean;
};

function undefinedColumn(error: unknown): boolean {
  const failure = error as { code?: string; cause?: { code?: string } };
  return (failure?.code ?? failure?.cause?.code) === "42703";
}

/** True once `operator_onboarding_nudges.signin_used_at` exists (migration 0022). */
export async function setupLinksAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const rows = await neon(process.env.DATABASE_URL).query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
        AND table_name='operator_onboarding_nudges' AND column_name='signin_used_at' LIMIT 1`) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Verify and use up a setup link. Never throws for a bad link; a database failure does throw. */
export async function consumeSetupLink(token: unknown, nextValue: unknown, now: Date = new Date()): Promise<SetupLinkResult> {
  const next = setupLinkDestination(nextValue);
  if (typeof token !== "string" || token.length > 200 || !next) return { ok: false, reason: "invalid" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid" };
  const [nudgeId, expiryText, given] = parts;
  if (!UUID.test(nudgeId) || !/^\d{9,11}$/.test(expiryText) || !/^[A-Za-z0-9_-]{20,100}$/.test(given)) return { ok: false, reason: "invalid" };
  const expiresAt = Number(expiryText);

  const query = neon(process.env.DATABASE_URL!);
  let row: LinkRow | undefined;
  try {
    [row] = await query.query(
      `SELECT x.id,x.operator_id,x.recipient,x.sent_at,x.signin_used_at,
              u.email,u.role::text role,u.session_version,coalesce(u.totp_enabled,false) totp_enabled,
              EXISTS(SELECT 1 FROM listings l WHERE l.id=x.listing_id AND l.operator_id=x.operator_id) owns_listing
         FROM operator_onboarding_nudges x JOIN users u ON u.id=x.operator_id
        WHERE x.id=$1::uuid AND x.stage<>'admin_review'`, [nudgeId]) as LinkRow[];
  } catch (error) {
    if (undefinedColumn(error)) return { ok: false, reason: "unavailable" };
    throw error;
  }
  if (!row) return { ok: false, reason: "invalid" };

  // The signature covers everything the link is bound to, so check it before saying anything specific.
  const expected = Buffer.from(signature({ nudgeId, operatorId: row.operator_id, sessionVersion: Number(row.session_version), expiresAt, next }));
  const provided = Buffer.from(given);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return { ok: false, reason: "invalid" };

  const sentAt = new Date(row.sent_at).getTime();
  // A link can never outlive its reminder, whatever expiry was signed.
  if (!Number.isFinite(sentAt) || expiresAt * 1000 > sentAt + SETUP_LINK_TTL_MS + 1000) return { ok: false, reason: "invalid" };
  if (now.getTime() >= expiresAt * 1000) return { ok: false, reason: "expired" };
  if (row.role !== "operator" || !row.owns_listing) return { ok: false, reason: "invalid" };
  if (row.recipient.trim().toLowerCase() !== row.email.trim().toLowerCase()) return { ok: false, reason: "invalid" };
  if (row.signin_used_at) return { ok: false, reason: "used" };
  if (row.totp_enabled) return { ok: false, reason: "use_password" };

  // One use: only the request that flips the row signs in.
  const claimed = await query.query(
    `UPDATE operator_onboarding_nudges x SET signin_used_at=now()
      WHERE x.id=$1::uuid AND x.signin_used_at IS NULL
        AND EXISTS(SELECT 1 FROM users u WHERE u.id=x.operator_id AND u.session_version=$2 AND u.role='operator'
          AND coalesce(u.totp_enabled,false)=false AND lower(btrim(u.email))=lower(btrim(x.recipient)))
      RETURNING x.id`, [nudgeId, Number(row.session_version)]) as { id: string }[];
  if (!claimed.length) return { ok: false, reason: "used" };

  const identity = await establishEmailIdentity(row.operator_id);
  if (!identity || identity.role !== "operator") return { ok: false, reason: "invalid" };
  if (identity.requiresTwoFactor) return { ok: false, reason: "use_password" };
  return { ok: true, identity, redirect: next };
}
