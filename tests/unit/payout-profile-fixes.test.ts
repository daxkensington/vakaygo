// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_PAYOUT_CURRENCIES, validatePayoutProfileInput } from "@/server/payout-profiles";
import { onboardingErrorResponse } from "@/server/business-onboarding";

const base = {
  listingId: "11111111-2222-3333-4444-555555555555",
  payoutMethod: "bank_wire",
  payoutCurrency: "USD",
  bankName: "Banco Popular",
  bankCountry: "DO",
  bankAccountHolder: "Faro Tours SRL",
  bankSwiftBic: "BPDODOSX",
  w8benCertified: true,
  w8benBeneficialOwner: "Faro Tours SRL",
  w8benCountry: "DO",
  w8benSignedName: "Synthetic Signer",
};

describe("payout profile fixes", () => {
  it("lets a blank account number keep the saved one (checked when saving)", () => {
    expect(validatePayoutProfileInput({ ...base, bankAccountNumber: "" }).bankAccountNumber).toBeNull();
    expect(validatePayoutProfileInput({ ...base }).bankAccountNumber).toBeNull();
    expect(validatePayoutProfileInput({ ...base, bankAccountNumber: "DO12 3456 7890" }).bankAccountNumber).toBe("DO1234567890");
    expect(() => validatePayoutProfileInput({ ...base, bankAccountNumber: "12" })).toThrow(/Account number/);
  });

  it("keeps SWIFT and branch/routing separate", () => {
    const parsed = validatePayoutProfileInput({ ...base, bankAccountNumber: "12345678", bankRoutingOrBranch: "021000021" });
    expect(parsed.bankSwiftBic).toBe("BPDODOSX");
    expect(parsed.bankRoutingOrBranch).toBe("021000021");
  });

  it("every currency the form offers is allowed by migration 0023", () => {
    const migration = readFileSync("drizzle/migrations/0023_booking_pricing_payout_currencies.sql", "utf8");
    const check = /payout_currency_check CHECK \(payout_currency IN \(([^)]*)\)\)/.exec(migration)![1];
    const allowed = check.split(",").map(value => value.trim().replace(/'/g, ""));
    expect([...allowed].sort()).toEqual([...ALLOWED_PAYOUT_CURRENCIES].sort());
    const form = readFileSync("app/operator/payouts/page.tsx", "utf8");
    const offered = [...form.matchAll(/<option value="([A-Z]{3})">/g)].map(match => match[1]);
    for (const currency of offered) expect(ALLOWED_PAYOUT_CURRENCIES as readonly string[]).toContain(currency);
    expect(offered).toEqual(expect.arrayContaining(["AWG", "XCG", "ANG"]));
  });

  it("reports a rejected value as a 400, not an outage", async () => {
    const response = onboardingErrorResponse(Object.assign(new Error("violates check constraint"), { code: "23514" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not accepted/);
    expect(onboardingErrorResponse(new Error("connection reset")).status).toBe(503);
  });

  it("clears activation only after the profile is saved", () => {
    const source = readFileSync("server/payout-profiles.ts", "utf8");
    expect(source.indexOf("INSERT INTO operator_payout_profiles")).toBeLessThan(source.indexOf("SET activated_at = NULL"));
  });
});
