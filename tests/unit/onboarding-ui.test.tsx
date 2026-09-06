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
  stripe: { connected: true }, termsVersion: "2026-09-06", activatedAt: null,
};
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response(JSON.stringify(status), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function renderPage() { const params = Promise.resolve({ listingId }); await act(async () => root.render(<Suspense fallback="Loading"><BusinessOnboardingPage params={params} /></Suspense>)); }

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

it("renders the exact operator terms draft version with fee, payout and refund responsibilities", async () => {
  await act(async () => root.render(<OperatorTermsPage />));
  expect(container.textContent).toContain("Version 2026-09-06");
  expect(container.textContent).toContain("Draft awaiting business and legal review");
  expect(container.textContent).toContain("Operator commission");
  expect(container.textContent).toContain("Payments and payouts");
  expect(container.textContent).toContain("Cancellations and refunds");
});
