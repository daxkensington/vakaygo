import { describe, it, expect } from "vitest";
import { compareMigrations, describeDrift } from "@/lib/migration-state";

/**
 * The journal as it stood when the 2026-09-06 outage happened, with the real
 * timestamps from drizzle/migrations/meta/_journal.json.
 */
const JOURNAL = [
  { idx: 0, tag: "0000_abandoned_the_hunter", when: 1776232979729 },
  { idx: 1, tag: "0001_soft_speed_demon", when: 1781294491511 },
  { idx: 2, tag: "0002_booking_requests_and_claims", when: 1788340566658 },
  { idx: 3, tag: "0003_booking_recovery_email", when: 1788386602980 },
  { idx: 4, tag: "0004_booking_integrity", when: 1788609600000 },
  { idx: 5, tag: "0005_rejected_payment_refunds", when: 1788694741108 },
  { idx: 6, tag: "0006_business_onboarding", when: 1788700000000 },
  { idx: 7, tag: "0007_booking_onboarding_enforcement", when: 1788700000001 },
  { idx: 8, tag: "0008_secure_account_bootstrap", when: 1788700000002 },
  { idx: 9, tag: "0009_listing_interest_outreach", when: 1788700000003 },
];

/** What production actually held on 2026-09-06: nothing past 0003. */
const APPLIED_THROUGH_0003 = [
  { created_at: "1774581597110" },
  { created_at: "1774799919552" },
  { created_at: "1776233489706" },
  { created_at: "1781294491511" },
  { created_at: "1788340566658" },
  { created_at: "1788386602980" },
];

describe("compareMigrations", () => {
  it("names every migration production was missing during the outage", () => {
    const report = compareMigrations(JOURNAL, APPLIED_THROUGH_0003);

    expect(report.pending.map((entry) => entry.tag)).toEqual([
      "0004_booking_integrity",
      "0005_rejected_payment_refunds",
      "0006_business_onboarding",
      "0007_booking_onboarding_enforcement",
      "0008_secure_account_bootstrap",
      "0009_listing_interest_outreach",
    ]);
    // 0009 is the one that defines vakaygo_listing_claim_verified(), whose absence
    // 500'd every listing detail page for six days.
    expect(report.pending.some((e) => e.tag === "0009_listing_interest_outreach")).toBe(true);
  });

  it("reports nothing pending once every migration has run", () => {
    const applied = JOURNAL.map((entry) => ({ created_at: String(entry.when) }));
    const report = compareMigrations(JOURNAL, applied);

    expect(report.pending).toEqual([]);
    expect(report.lastAppliedMillis).toBe(1788700000003);
    expect(describeDrift(report)).toContain("all 10 migrations applied");
  });

  it("treats a database with no recorded migrations as entirely behind, not as healthy", () => {
    const report = compareMigrations(JOURNAL, []);

    expect(report.pending).toHaveLength(JOURNAL.length);
    expect(report.lastAppliedMillis).toBeNull();
  });

  it("ignores the hand-inserted baseline hash rather than reporting it forever", () => {
    // The 2026-04-15 baseline row carries a hash that no longer matches the file on
    // disk. Drizzle compares timestamps, never hashes, so neither do we — otherwise
    // the check would cry wolf on every single run and get ignored.
    const report = compareMigrations(JOURNAL, [
      { created_at: "1788700000003", hash: "a-hash-that-matches-nothing-on-disk" },
    ]);

    expect(report.pending).toEqual([]);
  });

  it("orders pending migrations oldest first regardless of journal order", () => {
    const shuffled = [JOURNAL[9], JOURNAL[4], JOURNAL[6]];
    const report = compareMigrations(shuffled, APPLIED_THROUGH_0003);

    expect(report.pending.map((e) => e.tag)).toEqual([
      "0004_booking_integrity",
      "0006_business_onboarding",
      "0009_listing_interest_outreach",
    ]);
  });

  it("survives a non-numeric timestamp instead of silently treating it as current", () => {
    const report = compareMigrations(JOURNAL, [{ created_at: "not-a-number" }]);

    expect(report.lastAppliedMillis).toBeNull();
    expect(report.pending).toHaveLength(JOURNAL.length);
  });
});

describe("describeDrift", () => {
  it("says what is missing and how to fix it", () => {
    const message = describeDrift(compareMigrations(JOURNAL, APPLIED_THROUGH_0003));

    expect(message).toContain("behind this build by 6 migrations");
    expect(message).toContain("0009_listing_interest_outreach");
    expect(message).toContain("npm run db:migrate");
  });

  it("still says something when the database is healthy", () => {
    const message = describeDrift(compareMigrations(JOURNAL, [{ created_at: "1788700000003" }]));
    expect(message.length).toBeGreaterThan(0);
  });
});
