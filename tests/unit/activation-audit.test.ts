// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/countries";
import { CANCELLATION_POLICIES } from "@/lib/cancellation";
import { BOOKABLE_PRICE_UNITS, PRICE_UNITS_BY_TYPE, bookingFieldGaps, isBookablePriceUnit, priceUnitLabel, priceUnitsForType } from "@/lib/listing-price-units";
import {
  AGREEMENT_UPDATE_STAGE, ONBOARDING_STAGES, decideNudge, describeNextStep, listingGapsFromFlags, nextOnboardingStep, onlyDatesMissing,
  snapshotFromOnboardingRow, type OnboardingRowLike,
} from "@/lib/onboarding-nudges";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const TERMS = "2026-10-27";
const row = (over: Partial<OnboardingRowLike> = {}): OnboardingRowLike => ({
  claimValid: true, listingValid: true, listingStatus: "active",
  businessLegalName: "Island Tours SRL", businessCountry: "DO", businessAddress: "Calle El Conde 504, Santo Domingo",
  representativeName: "Ronnie Mancebo", authorityAcceptedAt: "2026-10-21T23:49:09Z", termsVersion: "2026-09-06", termsAcceptedAt: "2026-10-21T23:49:09Z",
  stripeAccountId: null, providerRevokedAt: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, cardPaymentsActive: false, transfersActive: false,
  activatedAt: null, suspendedAt: null, payoutStatus: null, payoutRevokedAt: null, w8benCertified: null, w8benSignedAt: null, ...over,
});

describe("price units", () => {
  it("offers only units the database lets a listing be booked with", () => {
    const migration = read("drizzle/migrations/0006_business_onboarding.sql");
    const inDatabase = /l\.price_unit IN \(([^)]+)\)/.exec(migration)![1].split(",").map(unit => unit.trim().replace(/'/g, ""));
    expect([...BOOKABLE_PRICE_UNITS].sort()).toEqual([...inDatabase].sort());
    for (const [type, units] of Object.entries(PRICE_UNITS_BY_TYPE)) {
      expect(units.length, type).toBeGreaterThan(0);
      for (const unit of units) expect(isBookablePriceUnit(unit), `${type}:${unit}`).toBe(true);
    }
    // Every listing type has an entry, and an unknown type still gets valid choices.
    expect(Object.keys(PRICE_UNITS_BY_TYPE).sort()).toEqual(["dining", "event", "excursion", "guide", "spa", "stay", "tour", "transfer", "transport", "vip"]);
    expect(priceUnitsForType("mystery")).toBe(BOOKABLE_PRICE_UNITS);
    expect(priceUnitLabel("session")).toBe("Session");
  });
  it("rejects the units the old forms offered that could never be booked", () => {
    for (const unit of ["avg meal", "treatment", "package", "week", "month", "boat", "table", "unit", "", null, 5]) expect(isBookablePriceUnit(unit), String(unit)).toBe(false);
  });
  it("uses the same SQL list in the reminder and onboarding gap checks", () => {
    const list = `l.price_unit IN (${BOOKABLE_PRICE_UNITS.map(unit => `'${unit}'`).join(",")})`;
    expect(read("server/onboarding-nudges.ts")).toContain(list);
    expect(read("server/business-onboarding.ts")).toContain(list);
  });
  it("names what a saved listing still needs before it can be booked", () => {
    expect(bookingFieldGaps({ price: "80", unit: "person", maxGuests: "8", policy: "flexible" })).toEqual([]);
    expect(bookingFieldGaps({ price: "", unit: "", maxGuests: "", policy: "" })).toEqual(["a price", "what the price is per", "maximum guests", "a cancellation policy"]);
    expect(bookingFieldGaps({ price: "150", unit: "person", maxGuests: "", policy: "moderate" })).toEqual(["maximum guests"]);
    expect(bookingFieldGaps({ price: "110", unit: "treatment", maxGuests: 2, policy: "strict" })).toEqual(["what the price is per"]);
  });
});

describe("listing gaps", () => {
  it("reports a missing price unit instead of the vague 'listing details'", () => {
    const flags = { hasPrice: true, hasCapacity: true, hasPolicy: true, hasOpenDates: true };
    const gaps = listingGapsFromFlags({ ...flags, hasPriceUnit: false })!;
    expect(gaps.unit).toBe(true);
    expect(onlyDatesMissing({ ...gaps, openDates: true })).toBe(false);
    const content = describeNextStep({ kind: "stage", stage: "listing_setup" }, { listingId: "l1", stripeConnected: false, listingGaps: gaps })!;
    expect(content.detail).toContain("Still missing: what the price is per (person, night, trip…).");
    expect(content.detail).not.toContain("listing details");
    expect(content.href).toBe("/operator/listings/l1");
    // A caller that never loaded the unit reports no unit gap.
    expect(listingGapsFromFlags(flags)).toEqual({ price: false, capacity: false, policy: false, openDates: false });
    expect(onlyDatesMissing({ price: false, capacity: false, policy: false, openDates: true })).toBe(true);
  });
});

describe("agreement update stage", () => {
  it("is its own stage only for a business that finished company details under an earlier agreement", () => {
    expect(ONBOARDING_STAGES).toContain(AGREEMENT_UPDATE_STAGE);
    expect(nextOnboardingStep(snapshotFromOnboardingRow(row(), TERMS))).toEqual({ kind: "stage", stage: "agreement_update" });
    // Never accepted anything: still the company-details step.
    expect(nextOnboardingStep(snapshotFromOnboardingRow(row({ termsVersion: null, termsAcceptedAt: null }), TERMS))).toEqual({ kind: "stage", stage: "business_details" });
    // Accepted an earlier version but company details are now incomplete: company details first.
    expect(nextOnboardingStep(snapshotFromOnboardingRow(row({ businessAddress: "short" }), TERMS))).toEqual({ kind: "stage", stage: "business_details" });
    // Current version accepted: on to the next step.
    expect(nextOnboardingStep(snapshotFromOnboardingRow(row({ termsVersion: TERMS }), TERMS))).toEqual({ kind: "stage", stage: "payout_setup" });
  });
  it("carries the re-acceptance copy and a count that ignores company-details reminders", () => {
    const content = describeNextStep({ kind: "stage", stage: "agreement_update" }, { listingId: "l1", stripeConnected: false, agreement: { onlyAgreementMissing: true, acceptedEarlierVersion: true, currentVersion: TERMS } })!;
    expect(content.title).toBe("Accept the updated operator agreement");
    expect(content.detail).toContain("on October 27, 2026");
    expect(content.href).toBe("/operator/onboarding/l1");
    const now = new Date("2026-11-11T16:15:02Z");
    const history = ["2026-11-04T16:15:02Z", "2026-10-27T20:15:02Z", "2026-10-20T20:15:02Z"].map(sentAt => ({ stage: "business_details", sentAt }));
    const input = { progressAt: "2026-10-22T00:18:54Z", optedOut: false, email: "owner@example.invalid", emailVerified: true, history, operatorLastNudgedAt: "2026-11-04T16:15:02Z" };
    expect(decideNudge({ ...input, step: { kind: "stage", stage: "agreement_update" } }, now)).toEqual({ send: true, stage: "agreement_update", nudgeNumber: 1, final: false });
    expect(decideNudge({ ...input, step: { kind: "stage", stage: "business_details" } }, now)).toEqual({ send: false, reason: "max_reached" });
    // The five-day gap between any two reminders for a listing still applies.
    expect(decideNudge({ ...input, step: { kind: "stage", stage: "agreement_update" } }, new Date("2026-11-08T16:15:02Z"))).toEqual({ send: false, reason: "recently_nudged" });
  });
  it("is allowed by migration 0022 and declared in the schema", () => {
    const migration = read("drizzle/migrations/0022_activation_reminders.sql");
    expect(migration).toContain("'business_details','agreement_update','listing_setup','payout_setup','payout_rejected','activate','admin_review'");
    expect(migration).toContain(`ADD COLUMN "signin_used_at" timestamp with time zone`);
    expect(read("drizzle/schema.ts")).toContain("'business_details','agreement_update','listing_setup'");
    expect(JSON.parse(read("drizzle/migrations/meta/_journal.json")).entries.at(-1).tag).toBe("0022_activation_reminders");
  });
});

describe("team booking notifications", () => {
  it("queues the team on confirmed, cancelled and refunded bookings without changing what travelers and businesses get", () => {
    const original = /CREATE FUNCTION vakaygo_booking_events\(\)[\s\S]*?END \$\$;/.exec(read("drizzle/migrations/0004_booking_integrity.sql"))![0];
    const revised = /CREATE OR REPLACE FUNCTION vakaygo_booking_events\(\)[\s\S]*?END \$\$;/.exec(read("drizzle/migrations/0022_activation_reminders.sql"))![0];
    const normalize = (text: string) => text.replace(/\r\n/g, "\n").replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION");
    expect(normalize(revised)).toBe(normalize(original).replace(
      "VALUES(NEW.id,event_kind,'traveler'),(NEW.id,event_kind,'operator') ON CONFLICT DO NOTHING;",
      "VALUES(NEW.id,event_kind,'traveler'),(NEW.id,event_kind,'operator'),(NEW.id,event_kind,'team') ON CONFLICT DO NOTHING;"));
    expect(normalize(revised)).not.toBe(normalize(original));
  });
});

describe("operator forms and admin links", () => {
  it("labels Bonaire by name in the registration country list", () => {
    expect(COUNTRIES.find(country => country.code === "BQ")?.name).toBe("Bonaire, Sint Eustatius & Saba (Caribbean Netherlands)");
    expect(COUNTRIES.find(country => country.code === "DO")?.name).toBe("Dominican Republic");
    expect(COUNTRIES.map(country => country.name)).toEqual([...COUNTRIES.map(country => country.name)].sort((a, b) => a.localeCompare(b, "en")));
  });
  it.each(["app/operator/listings/new/page.tsx", "app/operator/listings/[listingId]/page.tsx"])("%s shows the refund engine's own policy summaries and no 'Unlimited' capacity", file => {
    const source = read(file);
    for (const key of Object.keys(CANCELLATION_POLICIES)) expect(source).toContain(`CANCELLATION_POLICIES.${key}.summary`);
    expect(source).not.toMatch(/Free cancel 7 days|50% refund 14 days|placeholder="Unlimited"|avg meal/);
    expect(source).toContain("Needed before travelers can book.");
  });
  it("does not promise a publication time for a submitted listing", () => {
    expect(read("app/operator/listings/new/page.tsx")).not.toMatch(/within 24 hours/);
  });
  it("links the admin dashboard to listings in review and counts listings, not bookings", () => {
    const page = read("app/admin/page.tsx");
    expect(page).toContain('href="/admin/listings?status=pending_review"');
    expect(page).not.toContain('"/admin/listings?status=pending"');
    expect(page).not.toContain("pendingBookings");
    expect(read("app/api/admin/stats/route.ts")).toContain("reviewQueue: { listings: pendingListings.count, payoutProfiles: pendingPayoutProfiles.count }");
  });
  it("welcomes a business verified by SMS or voice like one verified by email", () => {
    const source = read("server/claim-email-verification.ts").replace(/\r\n/g, "\n");
    expect(source).toMatch(/const verified = await completeClaimVerification\(listingId, operatorId, code\);\n\s*await afterClaimApproved\(listingId, operatorId\);\n\s*return verified;/);
  });
});
