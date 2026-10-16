import { neon } from "@neondatabase/serverless";
import { OnboardingError } from "@/server/business-onboarding";

export type ClaimActor = { userId: string; sessionVersion: number; role: string; email: string };
export type ClaimResult = Record<string, unknown>;

// Listing locks serialize this path with the original phone claim functions.
// Separate ReadCommitted statements give the mutation a fresh snapshot after
// waiting for another owner, contact change or session revocation to commit.
export async function claimTransaction(
  actor: ClaimActor, listingId: string, operatorId: string,
  statement: string, values: unknown[] = [], options: { expireChallenges?: boolean; prepare?: string } = {},
): Promise<ClaimResult> {
  if (!process.env.DATABASE_URL) throw new OnboardingError("Business onboarding is unavailable", 503);
  const db = neon(process.env.DATABASE_URL);
  if (typeof actor.email !== "string" || !actor.email) throw new OnboardingError("Please sign in again.", 401);
  const parameters = [listingId, actor.userId, actor.sessionVersion, actor.role, operatorId, ...values, actor.email];
  const emailParameter = `$${values.length + 6}`;
  const identity = `WITH actor AS MATERIALIZED (
    SELECT id,role,email FROM users WHERE id=$2::uuid AND session_version=$3 AND role=$4
      AND email=${emailParameter}::text
      AND email_verified=true AND role IN ('operator','admin')
      AND (id=$5::uuid OR role='admin')
  ), claimant AS MATERIALIZED (
    SELECT u.id,u.name,u.email FROM users u CROSS JOIN actor
    WHERE u.id=$5::uuid AND u.role IN ('operator','admin') AND u.email_verified=true
  ), target AS MATERIALIZED (
    SELECT l.*,t.phone AS trusted_phone,t.source AS contact_source,t.source_reference AS contact_reference
    FROM listings l JOIN users owner ON owner.id=l.operator_id CROSS JOIN claimant
    LEFT JOIN listing_trusted_contacts t ON t.listing_id=l.id
    WHERE l.id=$1::uuid AND lower(owner.email)='unclaimed@vakaygo.com' AND owner.role='operator'
      AND (t.listing_id IS NULL OR t.original_operator_id=l.operator_id)
      AND NOT EXISTS(SELECT 1 FROM listing_onboarding n WHERE n.listing_id=l.id)
  )`;
  let result;
  try { result = await db.transaction(tx => {
    const queries = [
      tx.query("SELECT id FROM listings WHERE id=$1::uuid FOR UPDATE", [listingId]),
      tx.query("SELECT id FROM users WHERE id IN ($1::uuid,$2::uuid) OR id=(SELECT operator_id FROM listings WHERE id=$3::uuid) ORDER BY id FOR SHARE", [actor.userId, operatorId, listingId]),
      tx.query("SELECT listing_id FROM listing_trusted_contacts WHERE listing_id=$1::uuid FOR SHARE", [listingId]),
    ];
    if (options.expireChallenges) queries.push(tx.query(`${identity.replace(`${emailParameter}::text`, "$6::text")}
      UPDATE listing_claim_verifications v SET status='expired',updated_at=now(),check_token=NULL,check_locked_until=NULL
      FROM target t WHERE v.listing_id=t.id AND v.status IN ('sending','pending') AND v.expires_at<=now()`, [...parameters.slice(0, 5), actor.email]));
    if (options.prepare) queries.push(tx.query(`${identity} ${options.prepare}`, parameters));
    queries.push(tx.query(`${identity} ${statement}`, parameters));
    return queries;
  }, { isolationLevel: "ReadCommitted" }); }
  catch (error) {
    // The finalization assertion deliberately aborts the entire transaction if
    // a proved claim cannot complete. Do not commit a partial proof/claim.
    // Wrong email codes are explicitly exempt so their attempt count persists.
    if ((error as { code?: string }).code === "22012")
      throw new OnboardingError("The claim or business changed. Refresh the claim status.", 409);
    throw error;
  }
  const row = result[result.length - 1][0] as ClaimResult | undefined;
  if (row?.actorExists !== true) throw new OnboardingError("Your session changed. Please sign in again.", 401);
  return row;
}

// Each write depends on the preceding RETURNING rows. Any constraint failure
// rolls the entire transaction back, including the proof and original claim.
export const FINISH_CLAIM_SQL = `,
  approved AS (
    UPDATE listing_claims c SET status='approved',admin_notes=$6,reviewed_at=now(),updated_at=now(),
      reviewed_by=CASE WHEN $7::boolean THEN $2::uuid ELSE c.reviewed_by END
    FROM proof v WHERE c.id=v.claim_id AND c.operator_id=$5::uuid AND c.listing_id=$1::uuid AND c.status='pending'
    RETURNING c.id,c.listing_id
  ), transferred AS (
    UPDATE listings l SET operator_id=$5::uuid,
      type_data=(coalesce(l.type_data::jsonb,'{}'::jsonb)||'{"unclaimed":false}'::jsonb)::json,updated_at=now()
    FROM approved c,target t WHERE l.id=c.listing_id AND l.id=t.id AND l.operator_id=t.operator_id
    RETURNING l.id
  ), onboarded AS (
    INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id)
    SELECT l.id,$5::uuid,v.id FROM transferred l CROSS JOIN proof v
    RETURNING listing_id
  ), rejected AS (
    UPDATE listing_claims c SET status='rejected',admin_notes='Another verified claim was completed',reviewed_at=now(),updated_at=now()
    FROM onboarded n WHERE c.listing_id=n.listing_id AND c.status='pending' AND c.id<>(SELECT id FROM approved)
    RETURNING c.id
  )
  SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",
    coalesce((SELECT c.id FROM approved c CROSS JOIN onboarded),(SELECT claim_id FROM replay)) AS "claimId"`;

export const CLAIM_REPLAY_SQL = `,
  replay AS MATERIALIZED (
    SELECT c.id AS claim_id FROM listings l JOIN listing_onboarding n ON n.listing_id=l.id AND n.operator_id=l.operator_id
    JOIN listing_claim_verifications v ON v.id=n.verified_claim_id AND v.listing_id=l.id AND v.operator_id=l.operator_id
    JOIN listing_claims c ON c.id=v.claim_id AND c.listing_id=l.id AND c.operator_id=l.operator_id
    JOIN listing_trusted_contacts t ON t.listing_id=l.id AND t.phone=v.target_phone CROSS JOIN claimant
    WHERE l.id=$1::uuid AND l.operator_id=$5::uuid AND c.status='approved'
      AND v.status='verified' AND v.verified_at IS NOT NULL AND v.provider_approved_at IS NOT NULL
      AND v.provider_verification_id IS NOT NULL AND v.revoked_at IS NULL
  )`;
