import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { TEAM_INBOX } from "@/lib/booking-request";
import { checkRecipientSendingWindow } from "@/lib/outreach-timezone";
import {
  adminReviewDue, completedSteps, decideNudge, describeNextStep, nextOnboardingStep, snapshotFromOnboardingRow,
  ONBOARDING_CHECKLIST, type NudgeSkipReason, type OnboardingStage,
} from "@/lib/onboarding-nudges";
import { OPERATOR_TERMS_VERSION } from "@/server/business-onboarding";
import { sendOnboardingNudge, sendOnboardingReviewReminderToTeam } from "@/server/email-requests";
import { createNotification } from "@/server/notifications";

/**
 * Operator onboarding nudges — the I/O half of lib/onboarding-nudges.ts.
 *
 * Every 4 hours the cron asks for every claimed listing that is not activated,
 * works out the next step and whether a reminder is due, and emails the
 * business inside its own daytime hours. The reminder row is inserted BEFORE
 * the mail goes out (the unique index is the claim) and deleted if the
 * provider rejects it, so an overlapping run can never double-send.
 *
 * Payout profiles and listings that have waited on VakayGo's own review for
 * two days get the team one reminder a week, with an in-app note to admins.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUDGE_FEATURE_FLAG = "operator_onboarding_nudges_enabled";

function db() {
  if (!process.env.DATABASE_URL) throw new Error("Onboarding nudges are unavailable without a database");
  return neon(process.env.DATABASE_URL);
}
async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
  return await db().query(text, values) as T[];
}

export function appOrigin(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://vakaygo.com";
  try {
    const url = new URL(configured);
    return url.origin;
  } catch {
    return "https://vakaygo.com";
  }
}

// ─── Stop link ─────────────────────────────────────────────────────

function stopSignature(operatorId: string) {
  if (env.AUTH_SECRET.length < 32) throw new Error("Reminder signing unavailable");
  return createHmac("sha256", env.AUTH_SECRET).update(`onboarding-nudges-v1:${operatorId}`).digest("base64url");
}
export function nudgeStopToken(operatorId: string) {
  return `${operatorId}.${stopSignature(operatorId)}`;
}
export function verifyNudgeStopToken(token: string | null | undefined): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const operatorId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!UUID.test(operatorId) || !signature) return null;
  const expected = Buffer.from(stopSignature(operatorId));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return operatorId.toLowerCase();
}
export function nudgeStopUrl(operatorId: string, origin = appOrigin()) {
  return `${origin}/api/operator/onboarding-nudges/stop?token=${encodeURIComponent(nudgeStopToken(operatorId))}`;
}
export async function recordNudgeOptOut(operatorId: string, source = "email_link"): Promise<boolean> {
  if (!UUID.test(operatorId)) return false;
  const rows = await query<{ operator_id: string }>(
    `INSERT INTO operator_onboarding_nudge_optouts(operator_id,source) SELECT id,$2 FROM users WHERE id=$1::uuid
     ON CONFLICT (operator_id) DO UPDATE SET source=EXCLUDED.source RETURNING operator_id`, [operatorId, source.slice(0, 32)]);
  return rows.length > 0;
}

// ─── Feature flag ──────────────────────────────────────────────────

export async function nudgesEnabled(): Promise<boolean> {
  const [row] = await query<{ enabled: boolean }>("SELECT enabled FROM feature_flags WHERE key=$1", [NUDGE_FEATURE_FLAG]);
  return row?.enabled === true;
}

// ─── Candidates ────────────────────────────────────────────────────

type CandidateRow = {
  listing_id: string; operator_id: string; title: string; listing_status: string;
  island_slug: string; island_name: string; island_timezone: string | null;
  operator_email: string; operator_name: string | null; business_name: string | null; email_verified: boolean;
  business_legal_name: string | null; business_country: string | null; business_address: string | null; representative_name: string | null;
  authority_accepted_at: string | null; terms_version: string | null; terms_accepted_at: string | null;
  stripe_account_id: string | null; provider_revoked_at: string | null;
  charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; card_payments_active: boolean; transfers_active: boolean;
  activated_at: string | null; suspended_at: string | null; progress_at: string;
  claim_valid: boolean; listing_valid: boolean;
  payout_status: string | null; payout_revoked_at: string | null; w8ben_certified: boolean | null; w8ben_signed_at: string | null;
  opted_out: boolean; operator_last_nudged_at: string | null;
  history: { stage: string; sentAt: string }[];
};

async function candidates(): Promise<CandidateRow[]> {
  return query<CandidateRow>(`
    SELECT l.id listing_id,l.operator_id,l.title,l.status listing_status,
      i.slug island_slug,i.name island_name,i.timezone island_timezone,
      u.email operator_email,u.name operator_name,u.business_name,coalesce(u.email_verified,false) email_verified,
      n.business_legal_name,n.business_country,n.business_address,n.representative_name,
      n.authority_accepted_at,n.terms_version,n.terms_accepted_at,
      n.stripe_account_id,n.provider_revoked_at,
      n.charges_enabled,n.payouts_enabled,n.details_submitted,n.card_payments_active,n.transfers_active,
      n.activated_at,n.suspended_at,n.updated_at progress_at,
      vakaygo_listing_claim_verified(l.id) claim_valid,vakaygo_listing_setup_valid(l.id) listing_valid,
      p.status payout_status,p.revoked_at payout_revoked_at,p.w8ben_certified,p.w8ben_signed_at,
      EXISTS(SELECT 1 FROM operator_onboarding_nudge_optouts o WHERE o.operator_id=l.operator_id) opted_out,
      (SELECT max(x.sent_at) FROM operator_onboarding_nudges x WHERE x.operator_id=l.operator_id AND x.stage<>'admin_review') operator_last_nudged_at,
      coalesce((SELECT json_agg(json_build_object('stage',x.stage,'sentAt',x.sent_at) ORDER BY x.sent_at DESC)
                FROM operator_onboarding_nudges x WHERE x.listing_id=l.id AND x.stage<>'admin_review'),'[]'::json) history
    FROM listing_onboarding n
    JOIN listings l ON l.id=n.listing_id AND l.operator_id=n.operator_id
    JOIN users u ON u.id=l.operator_id
    JOIN islands i ON i.id=l.island_id
    LEFT JOIN operator_payout_profiles p ON p.listing_id=l.id AND p.operator_id=l.operator_id
    WHERE n.suspended_at IS NULL AND n.activated_at IS NULL
      AND u.role IN ('operator','admin')
      AND lower(u.email) NOT IN ('unclaimed@vakaygo.com','demo@vakaygo.com')
    ORDER BY n.updated_at ASC LIMIT 200`);
}

export interface NudgeRunResult {
  dryRun: boolean;
  candidates: number;
  sent: { listingId: string; title: string; stage: OnboardingStage; to: string; nudgeNumber: number }[];
  /** Dry run only: who would have been emailed right now. */
  wouldSend: { listingId: string; title: string; stage: OnboardingStage; to: string; nudgeNumber: number; localTime: string }[];
  skipped: Partial<Record<NudgeSkipReason | "claimed_elsewhere", number>>;
  outsideHours: { listingId: string; stage: OnboardingStage; localTime: string; timeZone: string }[];
  failed: { listingId: string; error: string }[];
  team: { items: number; sent: boolean; dueListings: string[] };
}

/** Run one pass. Safe to call concurrently: the database row is the send claim. */
export async function runOnboardingNudges(options: { now?: Date; dryRun?: boolean } = {}): Promise<NudgeRunResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;
  const origin = appOrigin();
  const rows = await candidates();
  const result: NudgeRunResult = { dryRun, candidates: rows.length, sent: [], wouldSend: [], skipped: {}, outsideHours: [], failed: [], team: { items: 0, sent: false, dueListings: [] } };
  const skip = (reason: keyof NudgeRunResult["skipped"]) => { result.skipped[reason] = (result.skipped[reason] || 0) + 1; };
  const nudgedOperators = new Map<string, number>();

  for (const row of rows) {
    const snapshot = snapshotFromOnboardingRow({
      claimValid: row.claim_valid, listingValid: row.listing_valid, listingStatus: row.listing_status,
      businessLegalName: row.business_legal_name, businessCountry: row.business_country, businessAddress: row.business_address,
      representativeName: row.representative_name, authorityAcceptedAt: row.authority_accepted_at,
      termsVersion: row.terms_version, termsAcceptedAt: row.terms_accepted_at,
      stripeAccountId: row.stripe_account_id, providerRevokedAt: row.provider_revoked_at,
      chargesEnabled: row.charges_enabled, payoutsEnabled: row.payouts_enabled, detailsSubmitted: row.details_submitted,
      cardPaymentsActive: row.card_payments_active, transfersActive: row.transfers_active,
      activatedAt: row.activated_at, suspendedAt: row.suspended_at,
      payoutStatus: row.payout_status, payoutRevokedAt: row.payout_revoked_at, w8benCertified: row.w8ben_certified, w8benSignedAt: row.w8ben_signed_at,
    }, OPERATOR_TERMS_VERSION);
    const step = nextOnboardingStep(snapshot);
    const operatorLast = nudgedOperators.get(row.operator_id) ?? (row.operator_last_nudged_at ? Date.parse(row.operator_last_nudged_at) : null);
    const decision = decideNudge({
      step, progressAt: row.progress_at, optedOut: row.opted_out, email: row.operator_email, emailVerified: row.email_verified,
      history: Array.isArray(row.history) ? row.history : [], operatorLastNudgedAt: operatorLast === null ? null : new Date(operatorLast),
    }, now);
    if (!decision.send) { skip(decision.reason); continue; }
    const content = describeNextStep(step, { listingId: row.listing_id, stripeConnected: snapshot.stripeConnected });
    if (!content) { skip("not_actionable"); continue; }

    // Daytime where the business is: the destination's zone first, then its registered country.
    const window = checkRecipientSendingWindow({ timeZoneOverride: row.island_timezone, islandSlug: row.island_slug, country: row.business_country, email: row.operator_email }, now);
    if (!window.allowed) {
      result.outsideHours.push({ listingId: row.listing_id, stage: decision.stage, localTime: window.localTimeFormatted, timeZone: window.timeZone });
      continue;
    }
    const to = row.operator_email.trim().toLowerCase();
    if (dryRun) {
      result.wouldSend.push({ listingId: row.listing_id, title: row.title, stage: decision.stage, to, nudgeNumber: decision.nudgeNumber, localTime: window.localTimeFormatted });
      nudgedOperators.set(row.operator_id, now.getTime());
      continue;
    }

    // Claim first; only the winner sends.
    const claimed = await query<{ id: string }>(
      `INSERT INTO operator_onboarding_nudges(listing_id,operator_id,stage,recipient,sent_on,sent_at)
       VALUES($1::uuid,$2::uuid,$3,$4,($5::timestamptz)::date,$5::timestamptz)
       ON CONFLICT (listing_id,stage,sent_on) DO NOTHING RETURNING id`,
      [row.listing_id, row.operator_id, decision.stage, to, now.toISOString()]);
    if (!claimed.length) { skip("claimed_elsewhere"); continue; }
    nudgedOperators.set(row.operator_id, now.getTime());
    try {
      const delivery = await sendOnboardingNudge({
        to,
        operatorName: row.operator_name || row.business_name,
        listingTitle: row.title,
        islandName: row.island_name,
        next: content,
        checklist: ONBOARDING_CHECKLIST.map(item => ({ label: item.label, done: snapshot.requirements[item.key] === true })),
        completed: completedSteps(snapshot.requirements),
        total: ONBOARDING_CHECKLIST.length,
        nudgeNumber: decision.nudgeNumber,
        final: decision.final,
        actionUrl: origin + content.href,
        stopUrl: nudgeStopUrl(row.operator_id, origin),
      });
      const messageId = delivery?.data?.id;
      if (messageId) await query("UPDATE operator_onboarding_nudges SET provider_message_id=$2 WHERE id=$1::uuid", [claimed[0].id, String(messageId).slice(0, 128)]);
      result.sent.push({ listingId: row.listing_id, title: row.title, stage: decision.stage, to, nudgeNumber: decision.nudgeNumber });
    } catch (error) {
      await query("DELETE FROM operator_onboarding_nudges WHERE id=$1::uuid", [claimed[0].id]).catch(() => undefined);
      nudgedOperators.delete(row.operator_id);
      logger.error("Onboarding nudge failed", { listingId: row.listing_id, stage: decision.stage, error });
      result.failed.push({ listingId: row.listing_id, error: error instanceof Error ? error.message : "send failed" });
    }
  }

  try {
    result.team = await remindTeamAboutReviews(now, dryRun, origin);
  } catch (error) {
    logger.error("Onboarding review reminder failed", { error });
  }
  if (result.sent.length || result.failed.length || result.team.sent) logger.info("Onboarding nudges", { sent: result.sent.length, failed: result.failed.length, team: result.team });
  return result;
}

// ─── Team: items waiting on VakayGo ────────────────────────────────

type ReviewRow = {
  kind: "payout_profile" | "listing"; listing_id: string; operator_id: string; title: string; island_name: string;
  waiting_since: string; detail: string | null; last_reminder_at: string | null;
};

async function remindTeamAboutReviews(now: Date, dryRun: boolean, origin: string): Promise<NudgeRunResult["team"]> {
  const rows = await query<ReviewRow>(`
    SELECT 'payout_profile' kind,p.listing_id,l.operator_id,l.title,i.name island_name,p.created_at waiting_since,
      p.payout_method||' · '||p.payout_currency detail,
      (SELECT max(x.sent_at) FROM operator_onboarding_nudges x WHERE x.listing_id=p.listing_id AND x.stage='admin_review') last_reminder_at
    FROM operator_payout_profiles p JOIN listings l ON l.id=p.listing_id JOIN islands i ON i.id=l.island_id
    WHERE p.status='pending_review' AND p.revoked_at IS NULL
    UNION ALL
    SELECT 'listing',l.id,l.operator_id,l.title,i.name,l.updated_at,l.type,
      (SELECT max(x.sent_at) FROM operator_onboarding_nudges x WHERE x.listing_id=l.id AND x.stage='admin_review')
    FROM listings l JOIN islands i ON i.id=l.island_id JOIN users u ON u.id=l.operator_id
    WHERE l.status='pending_review' AND lower(u.email) NOT IN ('unclaimed@vakaygo.com','demo@vakaygo.com')
    ORDER BY 6 ASC LIMIT 50`);
  const due = rows.filter(row => adminReviewDue({ waitingSince: row.waiting_since, lastReminderAt: row.last_reminder_at }, now));
  const team = { items: due.length, sent: false, dueListings: due.map(row => row.listing_id) };
  if (!due.length || dryRun) return team;

  const claimed: string[] = [];
  for (const row of due) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO operator_onboarding_nudges(listing_id,operator_id,stage,recipient,sent_on,sent_at)
       VALUES($1::uuid,$2::uuid,'admin_review',$3,($4::timestamptz)::date,$4::timestamptz)
       ON CONFLICT (listing_id,stage,sent_on) DO NOTHING RETURNING id`,
      [row.listing_id, row.operator_id, TEAM_INBOX, now.toISOString()]);
    if (inserted.length) claimed.push(inserted[0].id);
  }
  if (!claimed.length) return team; // another run already reminded the team today
  try {
    await sendOnboardingReviewReminderToTeam({
      items: due.map(row => ({ kind: row.kind, title: row.title, islandName: row.island_name, waitingSince: row.waiting_since, detail: row.detail })),
      payoutUrl: origin + "/admin/payout-profiles",
      listingsUrl: origin + "/admin/listings",
    });
    team.sent = true;
  } catch (error) {
    await query(`DELETE FROM operator_onboarding_nudges WHERE id = ANY($1::uuid[])`, [claimed]).catch(() => undefined);
    throw error;
  }
  const admins = await query<{ id: string }>("SELECT id FROM users WHERE role='admin'");
  const payoutCount = due.filter(row => row.kind === "payout_profile").length;
  const listingCount = due.length - payoutCount;
  const summary = [payoutCount ? `${payoutCount} payout profile${payoutCount === 1 ? "" : "s"}` : "", listingCount ? `${listingCount} listing${listingCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  await Promise.all(admins.map(admin => createNotification({
    userId: admin.id, type: "system",
    title: "Onboarding review waiting",
    body: `${summary} waiting on VakayGo for more than two days: ${due.map(row => row.title).slice(0, 3).join(", ")}${due.length > 3 ? "…" : ""}`,
    link: payoutCount ? "/admin/payout-profiles" : "/admin/listings",
  }).catch(() => undefined)));
  return team;
}
