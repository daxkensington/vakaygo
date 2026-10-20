import { DESTINATION_TIMEZONES } from "@/lib/outreach-timezone";

/** Conservative campaign policy. Provider acceptance never means inbox placement. */
export const OUTREACH_CAMPAIGN_KEY = "listing-claims-v2";
export const OUTREACH_DAILY_CAPS = [18, 24, 32, 44, 60] as const;
export const OUTREACH_HOURLY_CAP = 6;
export const OUTREACH_MIN_INTERVAL_SECONDS = 600;
export const OUTREACH_HEALTH_MAX_AGE_MS = 20 * 60_000;

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
  prerequisiteReasons?: string[];
}

export function evaluateCampaignHealth(snapshot: CampaignHealthSnapshot) {
  const reasons: string[] = [];
  const now = snapshot.now || new Date();
  const started = new Date(snapshot.stageStartedAt).getTime();
  if (!Number.isInteger(snapshot.stage) || snapshot.stage < 0 || snapshot.stage >= OUTREACH_DAILY_CAPS.length) reasons.push("invalid_stage");
  if (!Number.isFinite(started) || started > now.getTime()) reasons.push("invalid_stage_time");
  const counters = [snapshot.accepted, snapshot.bounced, snapshot.complained, snapshot.uncertain, snapshot.overdue, snapshot.matureAccepted, snapshot.matureResolved];
  if (counters.some(value => !Number.isInteger(value) || value < 0)) reasons.push("invalid_health_counts");
  if (!snapshot.prerequisitesReady) reasons.push(...(snapshot.prerequisiteReasons?.length ? snapshot.prerequisiteReasons : ["prerequisites_incomplete"]));
  if (!snapshot.telemetryHealthy) reasons.push("telemetry_unavailable");
  if (snapshot.complained > 0) reasons.push("complaint_hold");
  if (snapshot.uncertain > 0) reasons.push("uncertain_transport_hold");
  if (snapshot.overdue > 0) reasons.push("unresolved_delivery_hold");
  // Strictly below 2%, tighter than the provider ceiling. A single complaint
  // holds this small campaign, rather than hiding it inside a percentage.
  if (snapshot.bounced > 0 && (snapshot.accepted === 0 || snapshot.bounced / snapshot.accepted >= 0.02)) reasons.push("bounce_rate_hold");
  const ready = reasons.length === 0;
  const promotionReasons = [...reasons];
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
  if (provider !== "resend") reasons.push("provider_adapter_not_configured");
  if (!process.env.RESEND_API_KEY) reasons.push("mail_unconfigured");
  if (!process.env.RESEND_WEBHOOK_SECRET) reasons.push("webhook_secret_missing");
  if ((process.env.AUTH_SECRET?.length || 0) < 32) reasons.push("signing_secret_missing");
  if ((process.env.OUTREACH_SENDER_POSTAL_ADDRESS?.trim().length || 0) < 8) reasons.push("sender_postal_address_missing");
  const from = process.env.OUTREACH_FROM_ADDRESS || "hello@vakaygo.com";
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)*vakaygo\.com$/i.test(from)) reasons.push("invalid_sender_address");
  return { ready: reasons.length === 0, reasons, provider, from };
}

export function providerAllowsPermission(provider: string, kind: string): boolean {
  if (kind === "explicit_opt_in") return ["resend", "mailforge", "infraforge"].includes(provider);
  return kind === "business_outreach_permission" && ["mailforge", "infraforge"].includes(provider);
}
