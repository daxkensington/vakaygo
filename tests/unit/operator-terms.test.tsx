import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBookingPrice, CATEGORY_RATES } from "@/lib/pricing";
import {
  isPublicOperatorTermsPath,
  OPERATOR_TERMS_FEES,
  OPERATOR_TERMS_VERSION,
  PREVIOUS_OPERATOR_TERMS_PATH,
  PREVIOUS_OPERATOR_TERMS_VERSION,
} from "@/lib/operator-terms";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import OperatorTermsPage from "@/app/operator/onboarding/terms/page";
import ArchivedTermsPage from "@/app/operator/onboarding/terms/2026-09-06/page";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

function render(page: React.ReactElement) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(page);
  return container;
}
const feeRows = (container: HTMLElement) => Array.from(container.querySelectorAll("tbody tr"))
  .map(row => Array.from(row.querySelectorAll("th, td")).map(cell => cell.textContent?.trim()));

const fixedPaidRates = [
  ["stay", 12], ["tour", 15], ["excursion", 15], ["dining", 12], ["event", 10],
  ["transfer", 15], ["transport", 15], ["guide", 15], ["vip", 15], ["spa", 15],
] as const;

describe("fixed operator agreement fee schedule", () => {
  it("pins the revision and covers each priced listing type exactly once", () => {
    expect(OPERATOR_TERMS_VERSION).toBe("2026-10-27");
    const types = OPERATOR_TERMS_FEES.flatMap(fee => [...fee.types]);
    expect(types.length).toBe(fixedPaidRates.length);
    expect(new Set(types).size).toBe(types.length);
    expect([...types].sort()).toEqual(Object.keys(CATEGORY_RATES).sort());
  });

  it.each(fixedPaidRates)("keeps %s terms at the fixed %i%% rate and aligned with actual priced-booking calculations", (type, percent) => {
    const fee = OPERATOR_TERMS_FEES.find(row => row.types.some(rowType => rowType === type))!;
    expect(fee).toBeDefined();
    expect(fee.operatorPercent).toBe(percent);
    expect(fee.travelerPercent).toBe(0);
    expect(CATEGORY_RATES[type].operatorFee).toBe(percent / 100);
    expect(CATEGORY_RATES[type].travelerFee).toBe(0);
    const calculation = calculateBookingPrice({ pricePerUnit: 123.45, quantity: 3, listingType: type, currency: "EUR" });
    const expectedCommission = Math.round(370.35 * percent) / 100;
    expect(calculation.subtotal).toBeCloseTo(370.35);
    expect(calculation.serviceFee).toBe(0);
    expect(calculation.operatorCommission).toBe(expectedCommission);
    expect(calculation.total).toBeCloseTo(370.35);
    expect(calculation.operatorEarnings).toBeCloseTo(370.35 - expectedCommission);
    expect(calculation.currency).toBe("EUR");
  });

  it("renders separate free table requests and paid dining without applying the free request row to paid bookings", () => {
    const page = render(<OperatorTermsPage />);
    const rows = feeRows(page);
    expect(rows).toContainEqual(["Dining: table requests", "0%", "0%"]);
    expect(rows).toContainEqual(["Dining: paid culinary bookings", "12%", "0%"]);
    expect(OPERATOR_TERMS_FEES.find(row => row.label === "Dining: table requests")?.types).toEqual([]);
    expect(calculateBookingPrice({ pricePerUnit: 80, quantity: 4, listingType: "dining" }).operatorCommission).toBe(38.4);
    expect(page.textContent).toContain("A table reservation request has no booking charge or operator commission.");
    expect(page.textContent).toContain("A separate priced dining booking uses the paid culinary booking rate.");
    expect(page.textContent).toContain("A request, inquiry or saved listing does not establish a paid reservation.");
  });

  it("renders the fixed fee values, including zero traveler fees, rather than stale comparison marketing", () => {
    const page = render(<OperatorTermsPage />);
    expect(feeRows(page)).toEqual([
      ["Stays", "12%", "0%"], ["Tours and excursions", "15%", "0%"],
      ["Dining: table requests", "0%", "0%"], ["Dining: paid culinary bookings", "12%", "0%"],
      ["Events", "10%", "0%"], ["Transfers and transport", "15%", "0%"],
      ["Guides, VIP and spa services", "15%", "0%"],
    ]);
    expect(page.querySelector("caption")?.textContent).toContain("2026-10-27");
    expect(page.querySelectorAll('th[scope="col"]')).toHaveLength(3);
    expect(page.querySelectorAll('tbody th[scope="row"]')).toHaveLength(7);
  });
});

describe("current revision and historical acceptance boundaries", () => {
  it("preserves the old version, fee rows and launch/review warnings in the clearly identified archive", () => {
    const page = render(<ArchivedTermsPage />);
    expect(PREVIOUS_OPERATOR_TERMS_VERSION).toBe("2026-09-06");
    expect(PREVIOUS_OPERATOR_TERMS_PATH).toBe("/operator/onboarding/terms/2026-09-06");
    expect(page.querySelector('[role="status"]')?.textContent).toContain("Archived review draft");
    expect(page.querySelector('a[href="/operator/onboarding/terms"]')?.textContent).toBe("Read the current revision");
    expect(page.textContent).toContain("Version 2026-09-06");
    expect(feeRows(page)).toEqual([
      ["Stays", "3%", "9%"], ["Tours and excursions", "5%", "10%"], ["Dining", "0%", "0%"],
      ["Events", "3%", "5%"], ["Transfers", "4%", "8%"], ["Transport", "5%", "8%"],
      ["Guides, VIP and spa services", "5%", "10%"],
    ]);
    expect(page.textContent).toContain("Draft awaiting business and legal review.");
    expect(page.textContent).toContain("Online bookings and payments remain disabled.");
    expect(page.textContent).toContain("Material revisions require a new terms version and renewed acceptance.");
  });

  it("requires new acceptance while retaining financial records and qualifying booking eligibility", () => {
    const page = render(<OperatorTermsPage />);
    expect(page.querySelector(`a[href="${PREVIOUS_OPERATOR_TERMS_PATH}"]`)).not.toBeNull();
    expect(page.textContent).toContain("A previous acceptance does not count as acceptance of this revision.");
    expect(page.textContent).toContain("Acceptance alone does not enable bookings");
    expect(page.textContent).toContain("Historical booking amounts, payment records and cancellation policies are not rewritten by this revision.");
    expect(page.textContent).toContain("Existing paid-booking, cancellation, refund and support records remain available.");
    expect(page.textContent).not.toMatch(/bookings and payments (?:remain |are )(?:currently )?(?:disabled|unavailable)/i);
  });

  it("discloses deep-promotion effects and separates pending settlement records from actual payment", () => {
    const text = render(<OperatorTermsPage />).textContent!;
    expect(text).toContain("If the discount exceeds that share, it also reduces operator earnings.");
    expect(text).toContain("100.00 subtotal and a 20.00 discount has an 80.00 traveler total and 80.00 recorded operator earnings");
    expect(text).toContain("before any refund or external settlement costs");
    expect(text).toContain("they are not traveler checkout methods");
    expect(text).toContain("A released, pending or processing record does not mean a transfer has been sent or received.");
    expect(text).toContain("does not guarantee automatic transfer or a bank arrival date");
    expect(text).toContain("Submitting a profile or certification does not guarantee approval or country coverage.");
    expect(text).toContain("A partial refund does not necessarily reverse the application fee.");
  });
});

describe("public terms path allowlist", () => {
  it.each(["/operator/onboarding/terms", "/operator/onboarding/terms/2026-09-06"])("allows the exact readable revision %s", path => {
    expect(isPublicOperatorTermsPath(path)).toBe(true);
  });
  it.each([
    "/operator/onboarding/terms/", "/operator/onboarding/terms/unknown", "/operator/onboarding/terms/2026-10-27",
    "/operator/onboarding/terms/2026-09-06/private", "/operator/onboarding/terms/2026-09-06/",
    "/operator/onboarding/terms-extra", "/operator/onboarding/terms/%32%30%32%36-09-06",
    "/operator/onboarding/terms/../private", "/operator/onboarding/terms?next=/private",
    "/operator/onboarding/terms#private", "/operator/onboarding/private", "/operator/onboarding/terms//2026-09-06",
  ])("keeps unknown or non-exact paths behind the dashboard gate: %s", path => {
    expect(isPublicOperatorTermsPath(path)).toBe(false);
  });
});
