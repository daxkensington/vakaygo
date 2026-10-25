/**
 * Operator onboarding nudges — pure policy, no I/O.
 *
 * A business that claims its listing still has to finish company details,
 * listing setup (price, capacity, cancellation policy, open dates), payouts
 * and one final activation before travelers can book. Most stall on the way.
 * This module decides, from a snapshot of one claimed listing, which step is
 * next and whether a reminder is due now.
 *
 * Both the cron (app/api/cron/onboarding-nudges) and the operator dashboard
 * (/api/operator/stats → "Finish setting up") read their answers from here,
 * so the email and the checklist can never disagree about the next step.
 */

export type OnboardingStepKey = "claim" | "business" | "representative" | "terms" | "listing" | "payments" | "activation";
export type OnboardingRequirements = Record<OnboardingStepKey, boolean>;
export type PayoutProfileStatus = "pending_review" | "verified" | "rejected";

/** Steps the operator can act on, in funnel order. */
export type OnboardingStage = "business_details" | "listing_setup" | "payout_setup" | "payout_rejected" | "activate";
export const ONBOARDING_STAGES: readonly OnboardingStage[] = ["business_details", "listing_setup", "payout_setup", "payout_rejected", "activate"];

export interface OnboardingSnapshot {
  requirements: OnboardingRequirements;
  /** listings.status — a listing waiting on VakayGo review is not the operator's problem. */
  listingStatus: string;
  payoutProfileStatus: PayoutProfileStatus | null;
  payoutProfileRevoked: boolean;
  /** A Stripe Connect account exists; the operator may still have to finish Stripe's own checks. */
  stripeConnected: boolean;
  suspended: boolean;
}

export type OnboardingNextStep =
  | { kind: "stage"; stage: OnboardingStage }
  | { kind: "waiting"; on: "listing_review" | "payout_review" }
  | { kind: "done" }
  | { kind: "blocked"; reason: "unclaimed" | "suspended" };

/** The single next thing standing between this listing and bookings. */
export function nextOnboardingStep(s: OnboardingSnapshot): OnboardingNextStep {
  const r = s.requirements;
  if (!r.claim) return { kind: "blocked", reason: "unclaimed" };
  if (s.suspended) return { kind: "blocked", reason: "suspended" };
  if (r.activation) return { kind: "done" };
  if (!r.business || !r.representative || !r.terms) return { kind: "stage", stage: "business_details" };
  if (!r.listing || s.listingStatus !== "active") {
    if (r.listing && s.listingStatus === "pending_review") return { kind: "waiting", on: "listing_review" };
    return { kind: "stage", stage: "listing_setup" };
  }
  if (!r.payments) {
    if (s.payoutProfileStatus === "pending_review" && !s.payoutProfileRevoked) return { kind: "waiting", on: "payout_review" };
    if (s.payoutProfileStatus === "rejected" || (s.payoutProfileStatus === "verified" && s.payoutProfileRevoked)) return { kind: "stage", stage: "payout_rejected" };
    return { kind: "stage", stage: "payout_setup" };
  }
  return { kind: "stage", stage: "activate" };
}

/**
 * The raw listing_onboarding row joined to its listing, claim and payout profile.
 * Mirrors `requirements()` in server/business-onboarding.ts, minus the live
 * provider check: for a reminder, "Stripe connected and every flag on" is close
 * enough to "payments ready" — the live check only decides bookability.
 */
export interface OnboardingRowLike {
  claimValid: boolean;
  listingValid: boolean;
  listingStatus: string;
  businessLegalName: string | null;
  businessCountry: string | null;
  businessAddress: string | null;
  representativeName: string | null;
  authorityAcceptedAt: string | Date | null;
  termsVersion: string | null;
  termsAcceptedAt: string | Date | null;
  stripeAccountId: string | null;
  providerRevokedAt: string | Date | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  cardPaymentsActive: boolean;
  transfersActive: boolean;
  activatedAt: string | Date | null;
  suspendedAt: string | Date | null;
  payoutStatus: string | null;
  payoutRevokedAt: string | Date | null;
  w8benCertified: boolean | null;
  w8benSignedAt: string | Date | null;
}

const COUNTRY_CODE = /^[A-Z]{2}$/;

export function snapshotFromOnboardingRow(row: OnboardingRowLike, currentTermsVersion: string): OnboardingSnapshot {
  const stripeConnected = !!row.stripeAccountId && !row.providerRevokedAt;
  const directPayout = row.payoutStatus === "verified" && !row.payoutRevokedAt && row.w8benCertified === true && !!row.w8benSignedAt && !row.stripeAccountId;
  const stripeReady = stripeConnected && row.chargesEnabled && row.payoutsEnabled && row.detailsSubmitted && row.cardPaymentsActive && row.transfersActive;
  const payoutStatus = row.payoutStatus === "pending_review" || row.payoutStatus === "verified" || row.payoutStatus === "rejected" ? row.payoutStatus : null;
  return {
    requirements: {
      claim: row.claimValid === true,
      business: (row.businessLegalName?.trim().length || 0) >= 2 && COUNTRY_CODE.test(row.businessCountry || "") && (row.businessAddress?.trim().length || 0) >= 8,
      representative: !!row.authorityAcceptedAt && (row.representativeName?.trim().length || 0) >= 2,
      terms: row.termsVersion === currentTermsVersion && !!row.termsAcceptedAt,
      listing: row.listingValid === true,
      payments: directPayout || stripeReady,
      activation: !!row.activatedAt && !row.suspendedAt,
    },
    listingStatus: row.listingStatus,
    payoutProfileStatus: payoutStatus,
    payoutProfileRevoked: !!row.payoutRevokedAt,
    stripeConnected,
    suspended: !!row.suspendedAt,
  };
}

/** Steps shown as the progress checklist (activation is the finish line, not a step). */
export const ONBOARDING_CHECKLIST: readonly { key: OnboardingStepKey; label: string }[] = [
  { key: "claim", label: "Business claim verified" },
  { key: "business", label: "Company details" },
  { key: "representative", label: "Authorized representative" },
  { key: "terms", label: "Operator terms accepted" },
  { key: "listing", label: "Price, capacity, policy and open dates" },
  { key: "payments", label: "Payouts verified" },
];

export function completedSteps(r: OnboardingRequirements): number {
  return ONBOARDING_CHECKLIST.filter(step => r[step.key] === true).length;
}

export interface NextStepContent {
  /** Short imperative headline, also the email subject. */
  title: string;
  /** One or two sentences: what is missing and why it matters. */
  detail: string;
  actionLabel: string;
  /** Site-relative path; the email prefixes the origin. */
  href: string;
}

/** Copy and link for a stage. `null` for waiting/done/blocked — nothing for the operator to do. */
export function describeNextStep(step: OnboardingNextStep, ctx: { listingId: string; stripeConnected: boolean }): NextStepContent | null {
  if (step.kind !== "stage") return null;
  const id = encodeURIComponent(ctx.listingId);
  switch (step.stage) {
    case "business_details":
      return {
        title: "Finish your company details",
        detail: "Add your company's legal name, registered address and an authorized representative, then accept the operator terms. It takes about three minutes.",
        actionLabel: "Complete company details",
        href: `/operator/onboarding/${id}`,
      };
    case "listing_setup":
      return {
        title: "Set your price and open dates",
        detail: "Travelers can see your page but cannot book it yet. Set a price, guest capacity, a cancellation policy and the dates you are open.",
        actionLabel: "Set price and availability",
        href: `/operator/listings/${id}`,
      };
    case "payout_setup":
      return ctx.stripeConnected
        ? {
            title: "Finish secure payment setup",
            detail: "Your payment account was started, but Stripe still needs to confirm your company, identity and payout details before bookings can open.",
            actionLabel: "Continue payment setup",
            href: `/operator/onboarding/${id}`,
          }
        : {
            title: "Tell us how you want to be paid",
            detail: "Choose PayPal, Wise or a bank transfer and confirm your tax form. We verify payout details within two business days.",
            actionLabel: "Set up payouts",
            href: `/operator/payouts?listingId=${id}`,
          };
    case "payout_rejected":
      return {
        title: "Update your payout details",
        detail: "We could not verify the payout details you submitted. Review the note from our team and resubmit so bookings can open.",
        actionLabel: "Review payout details",
        href: `/operator/payouts?listingId=${id}`,
      };
    case "activate":
      return {
        title: "You are one click from going live",
        detail: "Every check has passed. Finalize setup and travelers can start booking.",
        actionLabel: "Finalize setup",
        href: `/operator/onboarding/${id}`,
      };
  }
}

export function describeWaiting(step: OnboardingNextStep): string | null {
  if (step.kind !== "waiting") return null;
  return step.on === "payout_review"
    ? "Your payout details are with our team for verification. Nothing is needed from you right now."
    : "Your listing is with our team for review. Nothing is needed from you right now.";
}

// ─── Reminder cadence ──────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A step has to be open this long before the first reminder. */
export const NUDGE_FIRST_AFTER_MS = 48 * HOUR;
/** Same step still open: remind again after this long. */
export const NUDGE_REPEAT_AFTER_MS = 7 * DAY;
/** Never two reminders for one listing closer than this, whatever the step. */
export const NUDGE_MIN_GAP_MS = 5 * DAY;
/** One business, several listings: at most one reminder a day across all of them. */
export const NUDGE_OPERATOR_GAP_MS = 24 * HOUR;
/** Reminders per step, then we go quiet. */
export const NUDGE_MAX_PER_STAGE = 3;

export interface NudgeHistoryEntry { stage: string; sentAt: Date | string }

export interface NudgeDecisionInput {
  step: OnboardingNextStep;
  /** Last onboarding progress (listing_onboarding.updated_at). */
  progressAt: Date | string;
  optedOut: boolean;
  email: string | null;
  emailVerified: boolean;
  /** Every reminder already sent for this listing, any order. */
  history: NudgeHistoryEntry[];
  /** Most recent reminder to this operator about any listing, if any. */
  operatorLastNudgedAt?: Date | string | null;
}

export type NudgeSkipReason =
  | "not_actionable" | "opted_out" | "no_email" | "email_unverified" | "max_reached" | "recently_nudged" | "operator_recently_nudged" | "too_soon";

export type NudgeDecision =
  | { send: true; stage: OnboardingStage; nudgeNumber: number; final: boolean }
  | { send: false; reason: NudgeSkipReason };

const ms = (value: Date | string) => (value instanceof Date ? value : new Date(value)).getTime();

export function decideNudge(input: NudgeDecisionInput, now: Date): NudgeDecision {
  if (input.step.kind !== "stage") return { send: false, reason: "not_actionable" };
  if (input.optedOut) return { send: false, reason: "opted_out" };
  if (!input.email || !input.email.includes("@")) return { send: false, reason: "no_email" };
  if (!input.emailVerified) return { send: false, reason: "email_unverified" };
  const stage = input.step.stage;
  const t = now.getTime();
  const sent = input.history
    .map(h => ({ stage: h.stage, at: ms(h.sentAt) }))
    .filter(h => Number.isFinite(h.at))
    .sort((a, b) => b.at - a.at);
  const sameStage = sent.filter(h => h.stage === stage);
  if (sameStage.length >= NUDGE_MAX_PER_STAGE) return { send: false, reason: "max_reached" };
  if (sent.length && t - sent[0].at < NUDGE_MIN_GAP_MS) return { send: false, reason: "recently_nudged" };
  if (input.operatorLastNudgedAt && t - ms(input.operatorLastNudgedAt) < NUDGE_OPERATOR_GAP_MS) return { send: false, reason: "operator_recently_nudged" };
  if (sameStage.length === 0) {
    if (t - ms(input.progressAt) < NUDGE_FIRST_AFTER_MS) return { send: false, reason: "too_soon" };
  } else if (t - sameStage[0].at < NUDGE_REPEAT_AFTER_MS) {
    return { send: false, reason: "too_soon" };
  }
  const nudgeNumber = sameStage.length + 1;
  return { send: true, stage, nudgeNumber, final: nudgeNumber >= NUDGE_MAX_PER_STAGE };
}

// ─── Items waiting on VakayGo (admin) ──────────────────────────────

/** A payout profile or listing left in review this long gets the team a reminder. */
export const ADMIN_REVIEW_REMIND_AFTER_MS = 48 * HOUR;
/** And again, while it still waits, every week. */
export const ADMIN_REVIEW_REPEAT_MS = 7 * DAY;

export function adminReviewDue(input: { waitingSince: Date | string; lastReminderAt: Date | string | null }, now: Date): boolean {
  const t = now.getTime();
  if (t - ms(input.waitingSince) < ADMIN_REVIEW_REMIND_AFTER_MS) return false;
  if (input.lastReminderAt !== null && t - ms(input.lastReminderAt) < ADMIN_REVIEW_REPEAT_MS) return false;
  return true;
}
