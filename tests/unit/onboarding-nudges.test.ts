// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  adminReviewDue, completedSteps, decideNudge, describeNextStep, describeWaiting, nextOnboardingStep, snapshotFromOnboardingRow,
  NUDGE_FIRST_AFTER_MS, NUDGE_MAX_PER_STAGE, NUDGE_MIN_GAP_MS, NUDGE_OPERATOR_GAP_MS, NUDGE_REPEAT_AFTER_MS,
  ADMIN_REVIEW_REMIND_AFTER_MS, ADMIN_REVIEW_REPEAT_MS,
  type OnboardingRowLike, type OnboardingSnapshot,
} from "@/lib/onboarding-nudges";

const NOW = new Date("2026-10-25T15:00:00Z");
const h = (n: number) => n * 3_600_000;
const ago = (msAgo: number) => new Date(NOW.getTime() - msAgo);
const TERMS = "2026-09-06";

type SnapshotOverrides = Omit<Partial<OnboardingSnapshot>, "requirements"> & { requirements?: Partial<OnboardingSnapshot["requirements"]> };

function snapshot(over: SnapshotOverrides = {}): OnboardingSnapshot {
  const { requirements, ...rest } = over;
  return {
    listingStatus: "active",
    payoutProfileStatus: null,
    payoutProfileRevoked: false,
    stripeConnected: false,
    suspended: false,
    ...rest,
    requirements: { claim: true, business: true, representative: true, terms: true, listing: true, payments: true, activation: false, ...requirements },
  };
}

describe("nextOnboardingStep", () => {
  it("walks the funnel in order and stops at the first open step", () => {
    expect(nextOnboardingStep(snapshot({ requirements: { terms: false } }))).toEqual({ kind: "stage", stage: "business_details" });
    expect(nextOnboardingStep(snapshot({ requirements: { business: false, listing: false, payments: false } }))).toEqual({ kind: "stage", stage: "business_details" });
    expect(nextOnboardingStep(snapshot({ requirements: { listing: false, payments: false } }))).toEqual({ kind: "stage", stage: "listing_setup" });
    expect(nextOnboardingStep(snapshot({ requirements: { payments: false } }))).toEqual({ kind: "stage", stage: "payout_setup" });
    expect(nextOnboardingStep(snapshot())).toEqual({ kind: "stage", stage: "activate" });
    expect(nextOnboardingStep(snapshot({ requirements: { activation: true } }))).toEqual({ kind: "done" });
  });

  it("treats a paused or draft listing as setup work, and a listing in review as waiting on the team", () => {
    expect(nextOnboardingStep(snapshot({ listingStatus: "draft" }))).toEqual({ kind: "stage", stage: "listing_setup" });
    expect(nextOnboardingStep(snapshot({ listingStatus: "pending_review" }))).toEqual({ kind: "waiting", on: "listing_review" });
    // Incomplete AND in review: the operator can still fix price and dates meanwhile.
    expect(nextOnboardingStep(snapshot({ listingStatus: "pending_review", requirements: { listing: false } }))).toEqual({ kind: "stage", stage: "listing_setup" });
  });

  it("knows the difference between a payout profile in review, rejected, revoked, or missing", () => {
    expect(nextOnboardingStep(snapshot({ requirements: { payments: false }, payoutProfileStatus: "pending_review" }))).toEqual({ kind: "waiting", on: "payout_review" });
    expect(nextOnboardingStep(snapshot({ requirements: { payments: false }, payoutProfileStatus: "rejected" }))).toEqual({ kind: "stage", stage: "payout_rejected" });
    expect(nextOnboardingStep(snapshot({ requirements: { payments: false }, payoutProfileStatus: "verified", payoutProfileRevoked: true }))).toEqual({ kind: "stage", stage: "payout_rejected" });
    expect(nextOnboardingStep(snapshot({ requirements: { payments: false }, payoutProfileStatus: "pending_review", payoutProfileRevoked: true }))).toEqual({ kind: "stage", stage: "payout_setup" });
  });

  it("never nudges an unclaimed or suspended listing", () => {
    expect(nextOnboardingStep(snapshot({ requirements: { claim: false } }))).toEqual({ kind: "blocked", reason: "unclaimed" });
    expect(nextOnboardingStep(snapshot({ suspended: true }))).toEqual({ kind: "blocked", reason: "suspended" });
  });
});

describe("snapshotFromOnboardingRow", () => {
  const row = (over: Partial<OnboardingRowLike> = {}): OnboardingRowLike => ({
    claimValid: true, listingValid: true, listingStatus: "active",
    businessLegalName: "Island Tours Ltd", businessCountry: "DO", businessAddress: "Calle El Conde 504, Santo Domingo",
    representativeName: "Ronnie Mancebo", authorityAcceptedAt: "2026-10-21T23:49:09Z", termsVersion: TERMS, termsAcceptedAt: "2026-10-21T23:49:09Z",
    stripeAccountId: null, providerRevokedAt: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, cardPaymentsActive: false, transfersActive: false,
    activatedAt: null, suspendedAt: null, payoutStatus: null, payoutRevokedAt: null, w8benCertified: null, w8benSignedAt: null, ...over,
  });

  it("mirrors the production requirements for the bootstrapped businesses", () => {
    // Bootstrapped on 10-15: legal name and address seeded, terms never accepted.
    const bootstrapped = snapshotFromOnboardingRow(row({ representativeName: "Priya's Spa", authorityAcceptedAt: null, termsVersion: null, termsAcceptedAt: null, listingValid: true }), TERMS);
    expect(bootstrapped.requirements).toMatchObject({ claim: true, business: true, representative: false, terms: false, listing: true, payments: false });
    expect(nextOnboardingStep(bootstrapped)).toEqual({ kind: "stage", stage: "business_details" });
    // Terms accepted, price set, but no open dates.
    const noDates = snapshotFromOnboardingRow(row({ listingValid: false, payoutStatus: "pending_review" }), TERMS);
    expect(nextOnboardingStep(noDates)).toEqual({ kind: "stage", stage: "listing_setup" });
    // Everything but payouts.
    expect(nextOnboardingStep(snapshotFromOnboardingRow(row(), TERMS))).toEqual({ kind: "stage", stage: "payout_setup" });
  });

  it("counts a verified direct payout profile with a signed W-8BEN as payments ready", () => {
    const ready = snapshotFromOnboardingRow(row({ payoutStatus: "verified", w8benCertified: true, w8benSignedAt: "2026-10-23T12:00:00Z" }), TERMS);
    expect(ready.requirements.payments).toBe(true);
    expect(nextOnboardingStep(ready)).toEqual({ kind: "stage", stage: "activate" });
    expect(snapshotFromOnboardingRow(row({ payoutStatus: "verified", w8benCertified: false, w8benSignedAt: "2026-10-23T12:00:00Z" }), TERMS).requirements.payments).toBe(false);
    expect(snapshotFromOnboardingRow(row({ payoutStatus: "verified", w8benCertified: true, w8benSignedAt: "2026-10-23T12:00:00Z", payoutRevokedAt: "2026-10-24T12:00:00Z" }), TERMS).requirements.payments).toBe(false);
  });

  it("treats a connected Stripe account as ready only when every flag is on", () => {
    const flags = { stripeAccountId: "acct_x", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, cardPaymentsActive: true, transfersActive: true };
    expect(snapshotFromOnboardingRow(row(flags), TERMS).requirements.payments).toBe(true);
    const partial = snapshotFromOnboardingRow(row({ ...flags, transfersActive: false }), TERMS);
    expect(partial.requirements.payments).toBe(false);
    expect(partial.stripeConnected).toBe(true);
    expect(describeNextStep(nextOnboardingStep(partial), { listingId: "l1", stripeConnected: true })?.actionLabel).toBe("Continue payment setup");
    expect(snapshotFromOnboardingRow(row({ ...flags, providerRevokedAt: "2026-10-24T00:00:00Z" }), TERMS).requirements.payments).toBe(false);
  });

  it("requires the current terms version and a real country code", () => {
    expect(snapshotFromOnboardingRow(row({ termsVersion: "2026-01-01" }), TERMS).requirements.terms).toBe(false);
    expect(snapshotFromOnboardingRow(row({ businessCountry: "dom" }), TERMS).requirements.business).toBe(false);
    expect(snapshotFromOnboardingRow(row({ businessAddress: "short" }), TERMS).requirements.business).toBe(false);
  });
});

describe("describeNextStep", () => {
  const id = "25e24d36-50be-49e0-8847-28d9e1f0f131";
  it("links every stage to the page where the operator fixes it", () => {
    expect(describeNextStep({ kind: "stage", stage: "business_details" }, { listingId: id, stripeConnected: false })?.href).toBe(`/operator/onboarding/${id}`);
    expect(describeNextStep({ kind: "stage", stage: "listing_setup" }, { listingId: id, stripeConnected: false })?.href).toBe(`/operator/listings/${id}`);
    expect(describeNextStep({ kind: "stage", stage: "payout_setup" }, { listingId: id, stripeConnected: false })?.href).toBe(`/operator/payouts?listingId=${id}`);
    expect(describeNextStep({ kind: "stage", stage: "payout_setup" }, { listingId: id, stripeConnected: true })?.href).toBe(`/operator/onboarding/${id}`);
    expect(describeNextStep({ kind: "stage", stage: "payout_rejected" }, { listingId: id, stripeConnected: false })?.href).toBe(`/operator/payouts?listingId=${id}`);
    expect(describeNextStep({ kind: "stage", stage: "activate" }, { listingId: id, stripeConnected: false })?.href).toBe(`/operator/onboarding/${id}`);
  });
  it("has nothing to say when the operator cannot act", () => {
    expect(describeNextStep({ kind: "waiting", on: "payout_review" }, { listingId: id, stripeConnected: false })).toBeNull();
    expect(describeNextStep({ kind: "done" }, { listingId: id, stripeConnected: false })).toBeNull();
    expect(describeWaiting({ kind: "waiting", on: "payout_review" })).toMatch(/with our team/);
    expect(describeWaiting({ kind: "stage", stage: "activate" })).toBeNull();
  });
  it("escapes the listing id inside links", () => {
    expect(describeNextStep({ kind: "stage", stage: "payout_setup" }, { listingId: "a b&c", stripeConnected: false })?.href).toBe("/operator/payouts?listingId=a%20b%26c");
  });
  it("counts completed checklist steps", () => {
    expect(completedSteps(snapshot().requirements)).toBe(6);
    expect(completedSteps(snapshot({ requirements: { terms: false, listing: false, payments: false } }).requirements)).toBe(3);
  });
});

describe("decideNudge", () => {
  const stage = { kind: "stage" as const, stage: "listing_setup" as const };
  const base = { step: stage, progressAt: ago(h(72)), optedOut: false, email: "owner@example.invalid", emailVerified: true, history: [] as { stage: string; sentAt: Date }[] };

  it("waits 48 hours after the last progress before the first reminder", () => {
    expect(decideNudge({ ...base, progressAt: ago(NUDGE_FIRST_AFTER_MS - 1) }, NOW)).toEqual({ send: false, reason: "too_soon" });
    expect(decideNudge({ ...base, progressAt: ago(NUDGE_FIRST_AFTER_MS) }, NOW)).toEqual({ send: true, stage: "listing_setup", nudgeNumber: 1, final: false });
  });

  it("repeats weekly for the same step, three times, then goes quiet", () => {
    const one = [{ stage: "listing_setup", sentAt: ago(NUDGE_REPEAT_AFTER_MS - h(1)) }];
    expect(decideNudge({ ...base, history: one }, NOW)).toEqual({ send: false, reason: "too_soon" });
    const oneDue = [{ stage: "listing_setup", sentAt: ago(NUDGE_REPEAT_AFTER_MS) }];
    expect(decideNudge({ ...base, history: oneDue }, NOW)).toEqual({ send: true, stage: "listing_setup", nudgeNumber: 2, final: false });
    const twoDue = [{ stage: "listing_setup", sentAt: ago(NUDGE_REPEAT_AFTER_MS) }, { stage: "listing_setup", sentAt: ago(NUDGE_REPEAT_AFTER_MS * 2) }];
    expect(decideNudge({ ...base, history: twoDue }, NOW)).toEqual({ send: true, stage: "listing_setup", nudgeNumber: 3, final: true });
    const three = [...twoDue, { stage: "listing_setup", sentAt: ago(NUDGE_REPEAT_AFTER_MS * 3) }];
    expect(decideNudge({ ...base, history: three }, NOW)).toEqual({ send: false, reason: "max_reached" });
    expect(NUDGE_MAX_PER_STAGE).toBe(3);
  });

  it("starts a fresh count when the operator reaches a new step, but keeps a five-day gap", () => {
    const previousStage = [{ stage: "business_details", sentAt: ago(NUDGE_MIN_GAP_MS - h(1)) }];
    expect(decideNudge({ ...base, history: previousStage }, NOW)).toEqual({ send: false, reason: "recently_nudged" });
    const spaced = [{ stage: "business_details", sentAt: ago(NUDGE_MIN_GAP_MS) }, { stage: "business_details", sentAt: ago(NUDGE_MIN_GAP_MS * 3) }, { stage: "business_details", sentAt: ago(NUDGE_MIN_GAP_MS * 5) }];
    expect(decideNudge({ ...base, history: spaced }, NOW)).toEqual({ send: true, stage: "listing_setup", nudgeNumber: 1, final: false });
  });

  it("sends a business with several listings at most one reminder a day", () => {
    expect(decideNudge({ ...base, operatorLastNudgedAt: ago(NUDGE_OPERATOR_GAP_MS - 1) }, NOW)).toEqual({ send: false, reason: "operator_recently_nudged" });
    expect(decideNudge({ ...base, operatorLastNudgedAt: ago(NUDGE_OPERATOR_GAP_MS) }, NOW).send).toBe(true);
  });

  it("respects opt-outs, missing or unverified addresses, and steps the operator cannot act on", () => {
    expect(decideNudge({ ...base, optedOut: true }, NOW)).toEqual({ send: false, reason: "opted_out" });
    expect(decideNudge({ ...base, email: null }, NOW)).toEqual({ send: false, reason: "no_email" });
    expect(decideNudge({ ...base, email: "not-an-address" }, NOW)).toEqual({ send: false, reason: "no_email" });
    expect(decideNudge({ ...base, emailVerified: false }, NOW)).toEqual({ send: false, reason: "email_unverified" });
    expect(decideNudge({ ...base, step: { kind: "waiting", on: "payout_review" } }, NOW)).toEqual({ send: false, reason: "not_actionable" });
    expect(decideNudge({ ...base, step: { kind: "done" } }, NOW)).toEqual({ send: false, reason: "not_actionable" });
    expect(decideNudge({ ...base, step: { kind: "blocked", reason: "suspended" } }, NOW)).toEqual({ send: false, reason: "not_actionable" });
  });

  it("ignores unparseable history timestamps instead of blocking forever", () => {
    expect(decideNudge({ ...base, history: [{ stage: "listing_setup", sentAt: "garbage" }] }, NOW).send).toBe(true);
  });
});

describe("adminReviewDue", () => {
  it("reminds the team after two days, then weekly while the item still waits", () => {
    expect(adminReviewDue({ waitingSince: ago(ADMIN_REVIEW_REMIND_AFTER_MS - 1), lastReminderAt: null }, NOW)).toBe(false);
    expect(adminReviewDue({ waitingSince: ago(ADMIN_REVIEW_REMIND_AFTER_MS), lastReminderAt: null }, NOW)).toBe(true);
    expect(adminReviewDue({ waitingSince: ago(h(24 * 10)), lastReminderAt: ago(ADMIN_REVIEW_REPEAT_MS - 1) }, NOW)).toBe(false);
    expect(adminReviewDue({ waitingSince: ago(h(24 * 10)), lastReminderAt: ago(ADMIN_REVIEW_REPEAT_MS) }, NOW)).toBe(true);
  });
});
