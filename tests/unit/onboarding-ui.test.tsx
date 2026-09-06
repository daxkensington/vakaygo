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
  expect(container.textContent).toContain("Payment setup is not available for companies registered in Grenada yet");
  expect(button("Save company details").disabled).toBe(false);
  expect(button("Continue secure payment setup").disabled).toBe(true);
  expect(button("Refresh verification status").disabled).toBe(false);
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
