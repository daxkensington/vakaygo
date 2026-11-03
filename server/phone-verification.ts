import { createHmac, randomInt, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { env, SESSION_SECRET } from "@/lib/env";
import type { SessionPayload } from "@/server/session-validation";

export type PhoneActor = SessionPayload & { sessionVersion: number };
export class PhoneVerificationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const validPhone = (phone: unknown): phone is string => typeof phone === "string" && /^\+[1-9][0-9]{7,14}$/.test(phone);
export const validPhoneCode = (code: unknown): code is string => typeof code === "string" && /^[0-9]{6}$/.test(code);
export function phoneCodeHash(actor: PhoneActor, code: string): string {
  return createHmac("sha256", SESSION_SECRET()).update(JSON.stringify(["vakaygo-personal-phone-v1", actor.userId, actor.sessionVersion, code])).digest("hex");
}
const identity = `WITH actor AS MATERIALIZED (
 SELECT id,phone,phone_verified FROM users WHERE id=$1::uuid AND session_version=$2
 AND role=$3 AND email=$4 AND (email_verified=true OR role='traveler')
)`;
type Result = { actorExists: boolean; [key: string]: unknown };
// This is a supported Neon HTTP batch, not an interactive transaction. A fresh
// statement snapshot follows the parent row-lock wait under ReadCommitted.
async function transaction(actor: PhoneActor, statement: string, values: unknown[] = [], write = true): Promise<Result> {
  const db = neon(env.DATABASE_URL);
  const parameters = [actor.userId, actor.sessionVersion, actor.role, actor.email, ...values];
  const result = await db.transaction(tx => [
    tx.query(`SELECT id FROM users WHERE id=$1::uuid FOR ${write ? "UPDATE" : "SHARE"}`, [actor.userId]),
    tx.query(`${identity} ${statement}`, parameters),
  ], { isolationLevel: "ReadCommitted" });
  const row = result[1][0] as Result | undefined;
  if (!row?.actorExists) throw new PhoneVerificationError("Your session changed. Please sign in again.", 401);
  return row;
}
export async function phoneStatus(actor: PhoneActor) {
  const row = await transaction(actor, `SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",
    (SELECT phone FROM actor) AS phone,(SELECT phone_verified FROM actor) AS verified`, [], false);
  return { userId: actor.userId, phone: row.phone as string | null, verified: row.verified === true };
}
export async function updatePhoneAwareProfile(actor: PhoneActor, update: { name?: string | null; phone?: string | null }) {
  const row = await transaction(actor, `, changed AS (
    UPDATE users u SET name=CASE WHEN $5::boolean THEN $6::text ELSE u.name END,
      phone=CASE WHEN $7::boolean THEN $8::text ELSE u.phone END,
      phone_verified=CASE WHEN $7::boolean AND u.phone IS DISTINCT FROM $8::text THEN false ELSE u.phone_verified END,updated_at=now()
    FROM actor a WHERE u.id=a.id RETURNING u.id,u.email,u.name,u.phone,u.avatar_url,u.role,u.business_name,u.created_at,
      a.phone IS DISTINCT FROM u.phone AS phone_changed
  ), invalidated AS (
    UPDATE user_phone_challenges h SET state='invalidated',code_hash=NULL,updated_at=now() FROM changed u
    WHERE u.phone_changed AND h.user_id=u.id RETURNING h.user_id
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",
    (SELECT json_build_object('id',u.id,'email',u.email,'name',u.name,'phone',u.phone,'avatarUrl',u.avatar_url,'role',u.role,'businessName',u.business_name,'createdAt',u.created_at) FROM changed u) AS "user",
    (SELECT count(*) FROM invalidated) AS invalidated`, [update.name !== undefined, update.name ?? null, update.phone !== undefined, update.phone ?? null]);
  return row.user;
}
export async function reservePhoneCode(actor: PhoneActor, phone: string) {
  if (!validPhone(phone)) throw new PhoneVerificationError("Enter a phone number in international format, for example +14735551234.");
  const id = randomUUID(), code = randomInt(100000, 1000000).toString();
  const row = await transaction(actor, `, reserved AS (
    INSERT INTO user_phone_challenges(user_id,challenge_id,phone,code_hash,session_version,profile_phone_snapshot,state,expires_at,attempts,next_send_at,send_window_started_at,send_count)
    SELECT id,$5::uuid,$6,$7,$2,phone,'sending',now()+interval '5 minutes',0,now()+interval '1 minute',now(),1 FROM actor
    ON CONFLICT(user_id) DO UPDATE SET challenge_id=excluded.challenge_id,phone=excluded.phone,code_hash=excluded.code_hash,
      session_version=excluded.session_version,profile_phone_snapshot=excluded.profile_phone_snapshot,state='sending',expires_at=excluded.expires_at,
      attempts=0,next_send_at=excluded.next_send_at,updated_at=now(),
      send_window_started_at=CASE WHEN user_phone_challenges.send_window_started_at<=now()-interval '1 hour' THEN now() ELSE user_phone_challenges.send_window_started_at END,
      send_count=CASE WHEN user_phone_challenges.send_window_started_at<=now()-interval '1 hour' THEN 1 ELSE user_phone_challenges.send_count+1 END
    WHERE user_phone_challenges.next_send_at<=now() AND(user_phone_challenges.send_window_started_at<=now()-interval '1 hour' OR user_phone_challenges.send_count<5)
    RETURNING challenge_id
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",(SELECT challenge_id FROM reserved) AS "challengeId"`, [id, phone, phoneCodeHash(actor, code)]);
  if (row.challengeId !== id) throw new PhoneVerificationError("Please wait before requesting another code. You can request up to five codes per hour.", 429);
  return { id, code };
}
export async function finishPhoneSend(actor: PhoneActor, id: string, sent: boolean) {
  const row = await transaction(actor, `, changed AS (
    UPDATE user_phone_challenges h SET state=$6::text,code_hash=CASE WHEN $6::text='pending' THEN h.code_hash ELSE NULL END,updated_at=now()
    FROM actor a WHERE h.user_id=a.id AND h.challenge_id=$5::uuid AND h.session_version=$2 AND h.state='sending'
      AND h.expires_at>now() AND h.profile_phone_snapshot IS NOT DISTINCT FROM a.phone
    RETURNING h.challenge_id
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",(SELECT challenge_id FROM changed) AS "challengeId"`, [id, sent ? "pending" : "failed"]);
  if (row.challengeId !== id) throw new PhoneVerificationError("Your verification changed. Request a new code.", 409);
}
export async function consumePhoneCode(actor: PhoneActor, code: string, expectedPhone?: unknown) {
  if (!validPhoneCode(code)) throw new PhoneVerificationError("Enter the six-digit verification code.");
  if (expectedPhone !== undefined && !validPhone(expectedPhone)) throw new PhoneVerificationError("Enter a valid international phone number.");
  const row = await transaction(actor, `, invalidated AS (
    UPDATE user_phone_challenges h SET state='expired',code_hash=NULL,updated_at=now() FROM actor a
    WHERE h.user_id=a.id AND h.state IN('sending','pending') AND(h.expires_at<=now() OR h.session_version<>$2 OR h.profile_phone_snapshot IS DISTINCT FROM a.phone)
    RETURNING h.user_id
  ), candidate AS MATERIALIZED (
    SELECT h.*,h.code_hash=$5 AS correct FROM user_phone_challenges h JOIN actor a ON a.id=h.user_id
    WHERE h.state='pending' AND h.expires_at>now() AND h.session_version=$2 AND h.attempts<5
      AND h.profile_phone_snapshot IS NOT DISTINCT FROM a.phone AND($6::text IS NULL OR h.phone=$6)
  ), attempted AS (
    UPDATE user_phone_challenges h SET attempts=h.attempts+1,
      state=CASE WHEN c.correct THEN 'consumed' WHEN h.attempts>=4 THEN 'locked' ELSE 'pending' END,
      code_hash=CASE WHEN c.correct OR h.attempts>=4 THEN NULL ELSE h.code_hash END,updated_at=now()
    FROM candidate c WHERE h.user_id=c.user_id AND h.challenge_id=c.challenge_id
    RETURNING c.correct,c.phone,h.attempts
  ), verified AS (
    UPDATE users u SET phone=p.phone,phone_verified=true,updated_at=now() FROM attempted p,actor a
    WHERE p.correct AND u.id=a.id RETURNING u.phone
  ) SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",(SELECT phone FROM verified) AS phone,
    EXISTS(SELECT 1 FROM verified) AS verified,
    EXISTS(SELECT 1 FROM attempted WHERE NOT correct AND attempts>=5) OR EXISTS(SELECT 1 FROM user_phone_challenges h JOIN actor a ON a.id=h.user_id WHERE h.state='locked') AS locked,
    1 / CASE WHEN EXISTS(SELECT 1 FROM attempted WHERE correct) AND NOT EXISTS(SELECT 1 FROM verified) THEN 0 ELSE 1 END AS atomicity`, [phoneCodeHash(actor, code), expectedPhone ?? null]);
  if (row.verified !== true) throw new PhoneVerificationError(row.locked ? "Too many attempts. Request a new code." : "Invalid or expired verification code. Request a new code if needed.", row.locked ? 429 : 400);
  return { userId: actor.userId, verified: true, phone: row.phone as string };
}
