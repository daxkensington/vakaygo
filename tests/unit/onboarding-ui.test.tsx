import React, { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import BusinessOnboardingPage from "@/app/operator/onboarding/[listingId]/page";
import OperatorTermsPage from "@/app/operator/onboarding/terms/page";

const listingId = "20000000-0000-4000-8000-000000000001";
const status = {
  listingId, canManage: true, eligible: false, bookingsEnabled: false, state: "onboarding_pending", reason: "payments_unavailable",
  listing: { title: "Verified company listing", slug: "verified-company", islandSlug: "grenada" },
  requirements: { claim: true, business: true, representative: true, terms: true, listing: true, payments: false, activation: false },
  business: { legalName: "Example Company", country: "GD", address: "Example business address", representativeName: "Example Representative" },
  allowedPaymentCountries: [], stripe: { connected: true }, termsVersion: "2026-09-06", activatedAt: null,
};
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response(JSON.stringify(status), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function renderPage() { const params = Promise.resolve({ listingId }); await act(async () => root.render(<Suspense fallback="Loading"><BusinessOnboardingPage params={params} /></Suspense>)); }
function button(label: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent === label)!; }

it("rechecks provider state after onboarding return without automatically activating or creating payments", async () => {
  await renderPage();
  expect(fetchMock).toHaveBeenCalledWith(`/api/operator/onboarding/${listingId}?refresh=1`, expect.objectContaining({ cache: "no-store" }));
  expect(fetchMock.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
  expect(container.textContent).toContain("Online bookings and payments are currently disabled");
  expect(container.textContent).not.toContain("This listing is eligible for online bookings");
  const finalize = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Check and finalize setup");
  expect(finalize?.disabled).toBe(true);
  expect(container.querySelector('a[href="/operator/onboarding/terms"]')?.textContent).toBe("operator terms review draft");
});

it("does not expose business setup forms when the API rejects ownership", async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "Only the current owner can manage onboarding" }), { status: 403 }));
  await renderPage();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("current owner");
  expect(container.querySelector("form")).toBeNull();
  expect(container.textContent).not.toContain("Start secure payment setup");
});

it("accepts worldwide registration countries without implying payment availability", async () => {
  await renderPage();
  const select = container.querySelector("select")!;
  expect(select.options.length).toBe(250);
  for (const [code, name] of [["AU", "Australia"], ["DE", "Germany"], ["JP", "Japan"], ["KE", "Kenya"], ["GP", "Guadeloupe"], ["PR", "Puerto Rico"]]) {
    expect(select.querySelector(`option[value="${code}"]`)?.textContent).toBe(name);
  }
  expect(container.textContent).toContain("Choose where your company is legally registered");
  // A country Stripe does not support is not a dead end: direct payouts are the path, and nothing says "not available".
  expect(container.textContent).not.toContain("not available for companies registered");
  expect(container.textContent).toContain("Companies registered in Grenada are paid directly by VakayGo");
  const payoutLinks = Array.from(container.querySelectorAll(`a[href="/operator/payouts?listingId=${listingId}"]`)).map(item => item.textContent);
  expect(payoutLinks).toContain("Set up payouts (Wise, PayPal or bank transfer)");
  expect(payoutLinks).toContain("Payments and payouts verified");
  expect(container.textContent).toContain("Next: add your payout details");
  expect(button("Save company details").disabled).toBe(false);
  // An already-connected Stripe account stays visible but cannot continue for an unsupported country.
  expect(button("Continue secure payment setup").disabled).toBe(true);
  expect(button("Refresh verification status").disabled).toBe(false);
});

it("hides Stripe entirely for an unsupported country without a connected account and names the next step", async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ...status, stripe: { connected: false } })));
  await renderPage();
  expect(Array.from(container.querySelectorAll("button")).some(item => /secure payment setup/.test(item.textContent || ""))).toBe(false);
  const next = container.querySelector('[data-testid="next-step"]')!;
  expect(next.textContent).toContain("Next step");
  expect(next.textContent).toContain("Tell us how you want to be paid");
  expect(next.querySelector("a")?.getAttribute("href")).toBe(`/operator/payouts?listingId=${listingId}`);
  expect(container.querySelector('a[href="/operator/payouts?listingId=' + listingId + '"]')).not.toBeNull();
});

it("shows the waiting state while a payout profile is under review", async () => {
  const pending = { ...status, stripe: { connected: false }, payoutProfile: { method: "bank_wire", currency: "USD", status: "pending_review", w8benCertified: true, revoked: false } };
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(pending)));
  await renderPage();
  const next = container.querySelector('[data-testid="next-step"]')!;
  expect(next.textContent).toContain("Waiting on VakayGo");
  expect(next.textContent).toContain("with our team for verification");
  expect(container.textContent).toContain("Review payout details");
  expect(container.textContent).toContain("Bank transfer · USD");
  expect(container.textContent).not.toContain("Next: add your payout details");
});

it("points a business that never accepted the terms at the company form first", async () => {
  const stalled = { ...status, stripe: { connected: false }, requirements: { ...status.requirements, representative: false, terms: false, listing: false } };
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(stalled)));
  await renderPage();
  const next = container.querySelector('[data-testid="next-step"]')!;
  expect(next.textContent).toContain("Finish your company details");
  expect(next.querySelector("a")?.getAttribute("href")).toBe("#company-details");
  const termsStep = Array.from(container.querySelectorAll("li a")).find(item => item.textContent === "Terms accepted");
  expect(termsStep?.getAttribute("href")).toBe("#company-details");
  const listingStep = Array.from(container.querySelectorAll("li a")).find(item => item.textContent === "Listing information complete");
  expect(listingStep?.getAttribute("href")).toBe(`/operator/listings/${listingId}`);
  expect(container.textContent).toContain("Set price, capacity and open dates");
});

it("offers Stripe first for a supported country while keeping direct payouts one click away", async () => {
  const supported = { ...status, stripe: { connected: false }, business: { ...status.business, country: "CA" }, allowedPaymentCountries: ["CA"] };
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(supported)));
  await renderPage();
  expect(button("Start secure payment setup").disabled).toBe(false);
  expect(container.textContent).not.toContain("paid directly by VakayGo");
  expect(container.querySelector(`a[href="/operator/payouts?listingId=${listingId}"]`)?.textContent).toBe("Prefer Wise, PayPal or bank transfer?");
  expect(container.textContent).toContain("Payment setup is available for your saved country of registration");
});

it("requires saved company details before connecting even when both countries are enabled", async () => {
  const configured = { ...status, business: { ...status.business, country: "CA" }, allowedPaymentCountries: ["CA", "US"] };
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(configured)));
  await renderPage();
  expect(button("Continue secure payment setup").disabled).toBe(false);
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "US"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button("Continue secure payment setup").disabled).toBe(true);
  expect(container.textContent).toContain("Save your company details before continuing");
  expect(fetchMock.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
  await act(async () => { select.value = "CA"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button("Continue secure payment setup").disabled).toBe(false);
});

it("keeps payment setup closed when country configuration is missing while allowing verification refresh", async () => {
  const unconfigured = { ...status, allowedPaymentCountries: undefined };
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(unconfigured)));
  await renderPage();
  expect(button("Continue secure payment setup").disabled).toBe(true);
  await act(async () => button("Refresh verification status").click());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith(`/api/operator/onboarding/${listingId}?refresh=1`, expect.objectContaining({ cache: "no-store" }));
  expect(container.textContent).toContain("Verification status refreshed");
});

it("renders the exact operator terms draft version with fee, payout and refund responsibilities", async () => {
  await act(async () => root.render(<OperatorTermsPage />));
  expect(container.textContent).toContain("Version 2026-09-06");
  expect(container.textContent).toContain("Draft awaiting business and legal review");
  expect(container.textContent).toContain("Operator commission");
  expect(container.textContent).toContain("Payments and payouts");
  expect(container.textContent).toContain("Cancellations and refunds");
});

it("preserves company drafts through a refresh failure and re-enables actions only after recovery", async () => {
  await renderPage(); const legalName = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(legalName, "Unsaved Company Draft"); legalName.dispatchEvent(new Event("input", { bubbles: true })); });
  fetchMock.mockRejectedValueOnce(new Error("Current status unavailable"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.querySelector("input")!.value).toBe("Unsaved Company Draft");
  expect(button("Save company details").disabled).toBe(true);
  expect(container.textContent).not.toContain("This listing is eligible for online bookings");
  await act(async () => button("Try loading status again").click());
  expect(container.querySelector("input")!.value).toBe("Unsaved Company Draft");
  expect(button("Save company details").disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("ignores an older ready refresh after a newer ownership denial", async () => {
  await renderPage(); let resolveOld!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Ownership changed" }), { status: 403 }));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => window.dispatchEvent(new Event("pageshow")));
  expect(container.querySelector("form")).toBeNull();
  await act(async () => resolveOld(new Response(JSON.stringify({ ...status, eligible: true, requirements: { ...status.requirements, payments: true } }))));
  expect(container.querySelector("form")).toBeNull();
  expect(container.textContent).not.toContain("This listing is eligible for online bookings");
});

it("offers recovery when onboarding status cannot load initially", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Status unavailable"));
  await renderPage();
  expect(container.querySelector("form")).toBeNull();
  await act(async () => button("Try loading status again").click());
  expect(container.querySelector("input")!.value).toBe("Example Company");
  expect(button("Save company details").disabled).toBe(false);
});
