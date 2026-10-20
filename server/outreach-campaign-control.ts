import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { OUTREACH_CAMPAIGN_KEY, OUTREACH_DAILY_CAPS, evaluateCampaignHealth, getOutreachPrerequisites, providerAllowsPermission } from "@/lib/outreach-campaign-policy";
import type { CampaignAdminAction, CampaignControl, CampaignPermission, CampaignReport } from "@/lib/outreach-campaign-admin";

export type CampaignAdminActor = { userId: string; sessionVersion: number; email: string };
export class CampaignControlError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "CampaignControlError"; }
}

// Shared with reservations. A second statement gets a fresh snapshot after a
// concurrent reservation/control mutation commits while we wait for this lock.
const CAMPAIGN_LOCK = "SELECT pg_advisory_xact_lock(hashtextextended('vakaygo-outreach-campaign',0))";
const ACTOR = `actor AS MATERIALIZED (SELECT id FROM users WHERE id=$1::uuid AND role='admin'
  AND session_version=$2 AND email=$3 AND email_verified=true)`;

// Provider acceptance, server delivery and engagement remain separate facts.
// Legacy mutable outreach notes are deliberately excluded from this ledger.
const HEALTH_CTES = `control AS MATERIALIZED (SELECT * FROM outreach_campaign_control WHERE id=true),
 window_stats AS (SELECT
  (SELECT count(*)::int FROM outreach_email_attempts all_providers
   WHERE all_providers.campaign_key=$11 AND all_providers.reserved_at>=now()-interval '24 hours') AS reserved_24h,
  count(*) FILTER(WHERE a.accepted_at>=now()-interval '7 days')::int AS accepted,
  count(*) FILTER(WHERE a.accepted_at>=now()-interval '7 days' AND a.delivered_at IS NOT NULL)::int AS delivered,
  count(*) FILTER(WHERE a.bounced_at>=now()-interval '7 days')::int AS bounced,
  count(*) FILTER(WHERE a.complained_at>=now()-interval '7 days')::int AS complained,
  (SELECT count(*)::int FROM outreach_email_attempts all_providers WHERE all_providers.campaign_key=$11
   AND (all_providers.state='uncertain' OR (all_providers.state='reserved' AND all_providers.reserved_at<now()-interval '20 minutes'))) AS uncertain,
  count(*) FILTER(WHERE a.accepted_at>=now()-interval '7 days' AND a.failed_at IS NOT NULL)::int AS failed,
  count(*) FILTER(WHERE a.accepted_at>=now()-interval '7 days' AND a.opened_at IS NOT NULL)::int AS opened,
  count(*) FILTER(WHERE a.accepted_at>=now()-interval '7 days' AND a.clicked_at IS NOT NULL)::int AS clicked,
  count(*) FILTER(WHERE a.accepted_at<now()-interval '24 hours' AND a.delivered_at IS NULL
   AND a.bounced_at IS NULL AND a.suppressed_at IS NULL AND a.failed_at IS NULL)::int AS overdue,
  count(*) FILTER(WHERE a.accepted_at>=greatest(c.stage_started_at,now()-interval '7 days') AND a.accepted_at<=now()-interval '24 hours')::int AS mature_accepted,
  count(*) FILTER(WHERE a.accepted_at>=greatest(c.stage_started_at,now()-interval '7 days') AND a.accepted_at<=now()-interval '24 hours'
   AND (a.delivered_at IS NOT NULL OR a.bounced_at IS NOT NULL))::int AS mature_resolved
 FROM control c LEFT JOIN outreach_email_attempts a ON a.provider=c.provider AND a.campaign_key=$11),
 snapshot AS (SELECT c.*,w.*,
  (c.health_ready AND c.health_checked_at>now()-interval '20 minutes' AND c.health_checked_at<=now()) AS telemetry_healthy
 FROM control c CROSS JOIN window_stats w)`;

type Snapshot = CampaignControl & {
  telemetryHealthy: boolean; healthReason: string; accepted: number; delivered: number; bounced: number;
  complained: number; uncertain: number; failed: number; opened: number; clicked: number;
  matureAccepted: number; matureResolved: number; overdue: number; reserved24h: number;
  activePermissions: number; suppressions: number;
  linkVisits: number; approvedClaimsFromLinks: number;
};

function reportPrerequisites(provider: string) {
  const prerequisites = getOutreachPrerequisites();
  const reasons = [...prerequisites.reasons];
  if (provider !== prerequisites.provider) reasons.push("selected_provider_mismatch");
  return { ready: prerequisites.ready && reasons.length === 0, reasons };
}

export async function readCampaignReport(): Promise<CampaignReport> {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql.query(`WITH ${HEALTH_CTES.replaceAll("$11", "$1")}
   SELECT enabled,stage,provider,version,stage_started_at::text AS "stageStartedAt",updated_at::text AS "updatedAt",
    pause_reason AS "pauseReason",coalesce(telemetry_healthy,false) AS "telemetryHealthy",health_reason AS "healthReason",
    reserved_24h AS "reserved24h",accepted,delivered,bounced,complained,uncertain,failed,opened,clicked,overdue,
    mature_accepted AS "matureAccepted",mature_resolved AS "matureResolved",
    (SELECT count(*)::int FROM outreach_email_suppressions) AS suppressions,
    (SELECT count(*)::int FROM outreach_claim_attributions t JOIN outreach_email_attempts a ON a.id=t.attempt_id
      WHERE a.provider=s.provider AND a.campaign_key=$1) AS "linkVisits",
    (SELECT count(*)::int FROM outreach_claim_attributions t JOIN outreach_email_attempts a ON a.id=t.attempt_id
      WHERE a.provider=s.provider AND a.campaign_key=$1 AND t.claim_id IS NOT NULL) AS "approvedClaimsFromLinks",
    (SELECT count(*)::int FROM outreach_recipient_consents p WHERE p.revoked_at IS NULL AND p.provider=s.provider
      AND NOT EXISTS(SELECT 1 FROM outreach_email_suppressions x WHERE x.recipient=p.recipient_email)) AS "activePermissions"
   FROM snapshot s`, [OUTREACH_CAMPAIGN_KEY]);
  if (rows.length !== 1) throw new CampaignControlError("Campaign controls are unavailable. Apply the reviewed migration before use.", 503);
  const snapshot = rows[0] as Snapshot;
  const prerequisites = reportPrerequisites(snapshot.provider);
  const health = evaluateCampaignHealth({ ...snapshot, prerequisitesReady: prerequisites.ready, prerequisiteReasons: prerequisites.reasons });
  const permissions = await sql.query(`SELECT p.id,p.listing_id AS "listingId",l.title AS "listingTitle",p.recipient_email AS "recipientEmail",
    p.provider,p.permission_kind AS "permissionKind",p.recipient_country AS "recipientCountry",p.evidence,
    p.policy_reference AS "policyReference",p.granted_at::text AS "grantedAt",p.granted_by AS "grantedBy",
    p.revoked_at::text AS "revokedAt",p.revocation_reason AS "revocationReason",
    EXISTS(SELECT 1 FROM outreach_email_suppressions x WHERE x.recipient=p.recipient_email) AS suppressed
   FROM outreach_recipient_consents p JOIN listings l ON l.id=p.listing_id ORDER BY p.granted_at DESC,p.id LIMIT 50`);
  return {
    control: { enabled: snapshot.enabled, stage: snapshot.stage, provider: snapshot.provider, version: snapshot.version,
      stageStartedAt: snapshot.stageStartedAt, updatedAt: snapshot.updatedAt, pauseReason: snapshot.pauseReason },
    caps: OUTREACH_DAILY_CAPS, prerequisites, health,
    metrics: { reserved24h: snapshot.reserved24h, accepted: snapshot.accepted, delivered: snapshot.delivered, bounced: snapshot.bounced,
      complained: snapshot.complained, uncertain: snapshot.uncertain, failed: snapshot.failed, opened: snapshot.opened, clicked: snapshot.clicked,
      matureAccepted: snapshot.matureAccepted, matureResolved: snapshot.matureResolved, suppressions: snapshot.suppressions, activePermissions: snapshot.activePermissions,
      linkVisits: snapshot.linkVisits, approvedClaimsFromLinks: snapshot.approvedClaimsFromLinks },
    // Link visits include scanners and forwarded links. Claims remain verified
    // through the normal ownership checks; this is association, not causation.
    permissions: permissions as CampaignPermission[],
  };
}

export async function applyCampaignAdminAction(actor: CampaignAdminActor, action: CampaignAdminAction): Promise<void> {
  if (action.action === "grant_consent" && !providerAllowsPermission(action.provider, action.permissionKind)) {
    throw new CampaignControlError("This provider does not allow the recorded permission basis.", 400);
  }
  const sql = neon(env.DATABASE_URL);
  const identity = [actor.userId, actor.sessionVersion, actor.email];
  const prerequisites = getOutreachPrerequisites();
  const results = await sql.transaction(tx => {
    const statements = [tx.query(CAMPAIGN_LOCK)];
    if (action.action === "grant_consent") statements.push(tx.query("SELECT id FROM listings WHERE id=$1::uuid FOR UPDATE", [action.listingId]));
    // Keep identity stable until the write commits, including role demotion.
    statements.push(tx.query("SELECT id FROM users WHERE id=$1::uuid FOR SHARE", [actor.userId]));
    if (action.action === "grant_consent") {
      statements.push(tx.query(`WITH ${ACTOR}, changed AS (
       INSERT INTO outreach_recipient_consents(listing_id,recipient_email,evidence,granted_by,permission_kind,provider,recipient_country,policy_reference)
       SELECT l.id,$5,$6,actor.id,$7,$8,$9,$10 FROM listings l JOIN islands i ON i.id=l.island_id CROSS JOIN actor
       WHERE l.id=$4::uuid AND l.status='active' AND i.is_active=true
        AND lower(trim(l.type_data->>'email'))=$5 AND $5=$11
        AND NOT EXISTS(SELECT 1 FROM business_outreach o WHERE o.listing_id=l.id AND o.status='do_not_contact')
        AND NOT EXISTS(SELECT 1 FROM outreach_email_suppressions x WHERE x.recipient=$5)
        AND NOT EXISTS(SELECT 1 FROM outreach_recipient_consents p WHERE p.listing_id=l.id AND p.recipient_email=$5 AND p.provider=$8 AND p.revoked_at IS NULL)
       RETURNING id)
       SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM changed) AS changed`,
      [...identity, action.listingId, action.recipientEmail, action.evidence, action.permissionKind, action.provider,
        action.recipientCountry || null, action.policyReference || null, action.expectedListingEmail]));
    } else if (action.action === "revoke_consent") {
      statements.push(tx.query(`WITH ${ACTOR}, changed AS (
       UPDATE outreach_recipient_consents p SET revoked_at=now(),revoked_by=actor.id,revocation_reason=$5
       FROM actor WHERE p.id=$4::uuid AND p.revoked_at IS NULL RETURNING p.id)
       SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM changed) AS changed`, [...identity, action.consentId, action.reason]));
    } else {
      statements.push(tx.query(`WITH ${ACTOR}, ${HEALTH_CTES}, gate AS (
       SELECT *,($9::boolean AND provider='resend' AND provider=$10 AND telemetry_healthy=true AND stage BETWEEN 0 AND 4
        AND stage_started_at<=now() AND complained=0 AND uncertain=0 AND overdue=0
        AND (bounced=0 OR (accepted>0 AND bounced::numeric/greatest(accepted,1)<0.02))) AS healthy FROM snapshot),
       changed AS (UPDATE outreach_campaign_control c SET
        enabled=CASE WHEN $5='pause' THEN false WHEN $5='enable' THEN true ELSE c.enabled END,
        stage=CASE WHEN $5='select_provider' THEN 0 WHEN $5='request_stage' THEN $6::int ELSE c.stage END,
        provider=CASE WHEN $5='select_provider' THEN $8 ELSE c.provider END,
        stage_started_at=CASE WHEN $5 IN ('select_provider','request_stage') THEN now() ELSE c.stage_started_at END,
        pause_reason=CASE WHEN $5='pause' THEN $7 WHEN $5='enable' THEN ''
         WHEN $5='select_provider' THEN 'Provider changed; awaiting validation' ELSE c.pause_reason END,
        health_ready=CASE WHEN $5='select_provider' THEN false ELSE c.health_ready END,
        health_checked_at=CASE WHEN $5='select_provider' THEN NULL ELSE c.health_checked_at END,
        health_reason=CASE WHEN $5='select_provider' THEN 'provider_changed' ELSE c.health_reason END,
        version=c.version+1,updated_by=actor.id,updated_at=now()
       FROM actor,gate g WHERE c.id=true AND c.version=$4 AND (
        $5='pause' OR ($5='select_provider' AND c.enabled=false) OR ($5='enable' AND g.healthy=true)
        OR ($5='request_stage' AND g.healthy=true AND $6::int=c.stage+1 AND c.stage<4
         AND c.stage_started_at<=now()-interval '72 hours' AND g.mature_accepted>=50 AND g.mature_resolved=g.mature_accepted))
       RETURNING c.id)
       SELECT EXISTS(SELECT 1 FROM actor) AS "actorExists",EXISTS(SELECT 1 FROM changed) AS changed`,
      [...identity, action.expectedVersion, action.action, action.action === "request_stage" ? action.stage : null,
        action.action === "pause" ? action.reason : null, action.action === "select_provider" ? action.provider : null,
        prerequisites.ready, prerequisites.provider, OUTREACH_CAMPAIGN_KEY]));
    }
    return statements;
  }, { isolationLevel: "ReadCommitted" });
  const result = results[results.length - 1][0];
  if (result?.actorExists !== true) throw new CampaignControlError("Your admin session changed. Sign in again.", 401);
  if (result?.changed !== true) throw new CampaignControlError("The record changed or a permission, suppression, or health gate blocked this action. Refresh and review the report.", 409);
}
