import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("lucide-react", () => ({ Loader2: () => null }));
import ClaimListingPage from "@/app/operator/claim/[listingId]/page";

const listingId = "20000000-0000-4000-8000-000000000009";
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function render() {
  await act(async () => { root.render(<ClaimListingPage params={Promise.resolve({ listingId })} />); });
}

it("sends an unverified account to email confirmation for this listing", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Verify your email before claiming a business.", code: "email_unverified" }), { status: 403 }));
  await render();
  expect(container.querySelector(`a[href="/auth/verify-email?claim=${listingId}"]`)?.textContent).toContain("Continue email verification");
  expect(container.textContent).not.toContain("Switch to a business account");
});

it("asks a traveler to switch into a business account", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Business account required", code: "role_required" }), { status: 403 }));
  await render();
  expect(container.textContent).toContain("Switch to a business account");
});

it("explains a missing trusted phone and links support to the listing", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    listing: { id: listingId, title: "Audit Cafe", address: "St. George's", islandName: "Grenada", url: "/grenada/audit-cafe", unclaimed: true, phoneHint: null },
    claim: null,
    verification: { state: "not_started", available: false, reason: "trusted_contact_unavailable" },
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  await render();
  expect(container.textContent).toContain("does not have a business phone");
  expect(container.querySelector('a[href="/contact?listing=%2Fgrenada%2Faudit-cafe"]')).not.toBeNull();
});
