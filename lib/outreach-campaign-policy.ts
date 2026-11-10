import { DESTINATION_TIMEZONES } from "@/lib/outreach-timezone";

/** Conservative campaign policy. Provider acceptance never means inbox placement. */
export const OUTREACH_CAMPAIGN_KEY = "listing-claims-v2";
export const OUTREACH_DAILY_CAPS = [18, 24, 32, 44, 60] as const;
export const OUTREACH_HOURLY_CAP = 6;
export const OUTREACH_MIN_INTERVAL_SECONDS = 600;
export const OUTREACH_HEALTH_MAX_AGE_MS = 20 * 60_000;

/**
 * Delivery holds. A percentage means nothing on a handful of sends, so below the
 * minimum sample a hold needs an absolute number of bad outcomes; at or above it
 * the rate applies. Counts cover the last 7 days, or the time since an
 * administrator last recorded a delivery review, whichever is shorter.
 * The same numbers are written into vakaygo_reserve_outreach_attempt (migration
 * 0019) and the SQL gates in server/outreach-campaign-*.ts: change them together.
 */
export const OUTREACH_RATE_HOLD_MIN_SAMPLE = 50;
export const OUTREACH_BOUNCE_RATE_LIMIT = 0.02;
export const OUTREACH_BOUNCE_ABSOLUTE_LIMIT = 3;
export const OUTREACH_FAILURE_RATE_LIMIT = 0.1;
export const OUTREACH_FAILURE_ABSOLUTE_LIMIT = 5;

export function outreachRateHold(count: number, accepted: number, absoluteLimit: number, rateLimit: number): boolean {
  if (!(count > 0)) return false;
  return accepted < OUTREACH_RATE_HOLD_MIN_SAMPLE ? count >= absoluteLimit : count / accepted >= rateLimit;
}

export function checkCampaignSendingWindow(islandSlug: string, now = new Date()) {
  const timeZone = DESTINATION_TIMEZONES[islandSlug.trim().toLowerCase()];
  if (!timeZone || !Number.isFinite(now.getTime())) return { allowed: false, timeZone: null, localTime: null };
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
    const get = (name: string) => parts.find(part => part.type === name)?.value || "";
    const minutes = Number(get("hour")) * 60 + Number(get("minute"));
    return { allowed: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(get("weekday")) && minutes >= 540 && minutes < 1020,
      timeZone, localTime: `${get("hour")}:${get("minute")}` };
  } catch { return { allowed: false, timeZone: null, localTime: null }; }
}

export interface CampaignHealthSnapshot {
  stage: number;
  stageStartedAt: string | Date;
  now?: Date;
  prerequisitesReady: boolean;
  telemetryHealthy: boolean;
  accepted: number;
  bounced: number;
  complained: number;
  uncertain: number;
  overdue: number;
  matureAccepted: number;
  matureResolved: number;
  /** Soft failures, blocks and rate limits on accepted messages in the window. */
  failed?: number;
  /** Counts since the last recorded delivery review; default to the 7-day counts. */
  holdAccepted?: number;
  holdBounced?: number;
  holdFailed?: number;
  prerequisiteReasons?: string[];
}

export function evaluateCampaignHealth(snapshot: CampaignHealthSnapshot) {
  const reasons: string[] = [];
  const now = snapshot.now || new Date();
  const started = new Date(snapshot.stageStartedAt).getTime();
  if (!Number.isInteger(snapshot.stage) || snapshot.stage < 0 || snapshot.stage >= OUTREACH_DAILY_CAPS.length) reasons.push("invalid_stage");
  if (!Number.isFinite(started) || started > now.getTime()) reasons.push("invalid_stage_time");
  const holdAccepted = snapshot.holdAccepted ?? snapshot.accepted;
  const holdBounced = snapshot.holdBounced ?? snapshot.bounced;
  const holdFailed = snapshot.holdFailed ?? snapshot.failed ?? 0;
  const counters = [snapshot.accepted, snapshot.bounced, snapshot.complained, snapshot.uncertain, snapshot.overdue, snapshot.matureAccepted, snapshot.matureResolved, holdAccepted, holdBounced, holdFailed];
  if (counters.some(value => !Number.isInteger(value) || value < 0)) reasons.push("invalid_health_counts");
  if (!snapshot.prerequisitesReady) reasons.push(...(snapshot.prerequisiteReasons?.length ? snapshot.prerequisiteReasons : ["prerequisites_incomplete"]));
  if (!snapshot.telemetryHealthy) reasons.push("telemetry_unavailable");
  if (snapshot.complained > 0) reasons.push("complaint_hold");
  if (snapshot.uncertain > 0) reasons.push("uncertain_transport_hold");
  if (snapshot.overdue > 0) reasons.push("unresolved_delivery_hold");
  // Strictly below 2% once the sample is large enough, tighter than the provider
  // ceiling. A single complaint still holds this small campaign. One bounce or
  // soft failure is an outcome for that recipient, who is never emailed twice in
  // a campaign; it is not a reason to stop writing to everyone else.
  if (outreachRateHold(holdBounced, holdAccepted, OUTREACH_BOUNCE_ABSOLUTE_LIMIT, OUTREACH_BOUNCE_RATE_LIMIT)) reasons.push("bounce_rate_hold");
  if (outreachRateHold(holdFailed, holdAccepted, OUTREACH_FAILURE_ABSOLUTE_LIMIT, OUTREACH_FAILURE_RATE_LIMIT)) reasons.push("failure_rate_hold");
  const ready = reasons.length === 0;
  const promotionReasons = [...reasons];
  // A larger daily cap needs a clean 7-day record. A recorded delivery review
  // restarts the sending holds; it does not shorten this window.
  if (snapshot.bounced > 0 && (snapshot.accepted === 0 || snapshot.bounced / snapshot.accepted >= OUTREACH_BOUNCE_RATE_LIMIT)) promotionReasons.push("bounce_rate_hold");
  if ((snapshot.failed ?? 0) > 0) promotionReasons.push("failed_delivery_in_window");
  if (now.getTime() - started < 72 * 60 * 60_000) promotionReasons.push("stage_observation_period");
  if (snapshot.matureAccepted < 50) promotionReasons.push("insufficient_mature_sample");
  if (snapshot.matureResolved !== snapshot.matureAccepted) promotionReasons.push("mature_delivery_coverage_incomplete");
  if (snapshot.stage >= OUTREACH_DAILY_CAPS.length - 1) promotionReasons.push("maximum_stage");
  return { ready, reasons: [...new Set(reasons)], nextStageAllowed: promotionReasons.length === 0,
    promotionReasons: [...new Set(promotionReasons)], dailyCap: OUTREACH_DAILY_CAPS[snapshot.stage] ?? 0 };
}

export function getOutreachPrerequisites() {
  const reasons: string[] = [];
  const provider = process.env.OUTREACH_PROVIDER || "resend";
  // Alternate providers require a separately validated transport and event
  // adapter. An arbitrary SMTP hostname is never a policy bypass.
  if (!["resend", "sendcorex"].includes(provider)) reasons.push("provider_adapter_not_configured");
  if (provider === "sendcorex") {
    if (!process.env.SENDCOREX_API_KEY) reasons.push("mail_unconfigured");
    if ((process.env.SENDCOREX_WEBHOOK_SECRET?.length || 0) < 32) reasons.push("webhook_secret_missing");
    if (!process.env.SENDCOREX_WEBHOOK_ID) reasons.push("webhook_id_missing");
  } else {
    if (!process.env.RESEND_API_KEY) reasons.push("mail_unconfigured");
    if (!process.env.RESEND_WEBHOOK_SECRET) reasons.push("webhook_secret_missing");
  }
  if ((process.env.AUTH_SECRET?.length || 0) < 32) reasons.push("signing_secret_missing");
  if ((process.env.OUTREACH_SENDER_POSTAL_ADDRESS?.trim().length || 0) < 8) reasons.push("sender_postal_address_missing");
  const from = process.env.OUTREACH_FROM_ADDRESS || "hello@vakaygo.com";
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)*vakaygo\.com$/i.test(from)) reasons.push("invalid_sender_address");
  return { ready: reasons.length === 0, reasons, provider, from };
}

export function providerAllowsPermission(provider: string, kind: string): boolean {
  if (kind === "explicit_opt_in") return ["resend", "sendcorex", "mailforge", "infraforge"].includes(provider);
  return kind === "business_outreach_permission" && ["sendcorex", "mailforge", "infraforge"].includes(provider);
}
