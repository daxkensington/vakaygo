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

const summary = (state = "not_started", overrides: Record<string, unknown> = {}) => ({
  listing: { id: listingId, title: "Audit Cafe", address: "St. George's", islandName: "Grenada", url: "/grenada/audit-cafe", unclaimed: true, phoneHint: "••• ••• 23" },
  claim: { id: "synthetic-claim", status: "pending" }, claimVerified: false,
  verification: { state, available: true, canStart: state !== "pending", channels: ["sms", "call"] }, ...overrides,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === text)!;

it("resumes a pending code after reload and keeps a second send unavailable", async () => {
  fetchMock.mockResolvedValue(response(summary("pending")));
  await render();
  expect(container.querySelector('input[autocomplete="one-time-code"]')).not.toBeNull();
  expect(button("Send verification code").disabled).toBe(true);
  expect(container.textContent).toContain("A code has already been sent");
  expect(fetchMock.mock.calls.every(call => !call[1]?.method)).toBe(true);
});

it("recovers an initial load failure without claiming an empty or missing business", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: "Verification status unavailable" }, 503)).mockResolvedValueOnce(response(summary()));
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("status unavailable");
  await act(async () => button("Try loading again").click());
  expect(container.textContent).toContain("Audit Cafe");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("does not treat a historical approved claim as current ownership proof", async () => {
  const data = summary("revoked", { claim: { id: "old-claim", status: "approved" }, claimVerified: false });
  data.listing.unclaimed = false;
  fetchMock.mockResolvedValue(response(data));
  await render();
  expect(container.textContent).not.toContain("Business claim verified");
  expect(container.querySelector('a[href*="/operator/onboarding/"]')).toBeNull();
});

it("makes a competing phone challenge explicit without sending another code", async () => {
  fetchMock.mockResolvedValue(response(summary("not_started", { verification: { state: "not_started", available: true, canStart: false, busyUntil: "2099-12-01T12:00:00Z" } })));
  await render();
  expect(button("Send verification code").disabled).toBe(true);
  expect(container.querySelector("form")).toBeNull();
  expect(container.textContent).toContain("already in progress");
});

it("retains an incorrect code for retry and redirects only after verified approval", async () => {
  fetchMock.mockResolvedValueOnce(response(summary("pending"))).mockResolvedValueOnce(response({ error: "The verification code is incorrect" }, 400)).mockResolvedValueOnce(response({ claim: { status: "approved" } }));
  await render(); const code = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(code, "123456"); code.dispatchEvent(new Event("input", { bubbles: true })); });
  const submit = async () => { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); };
  await submit();
  expect(code.value).toBe("123456"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("incorrect"); expect(router.push).not.toHaveBeenCalled();
  await submit(); expect(router.push).toHaveBeenCalledExactlyOnceWith(`/operator/onboarding/${listingId}`);
});

it("offers contextual support after a configured provider fails without fabricating sent or verified status", async () => {
  fetchMock.mockResolvedValueOnce(response(summary())).mockResolvedValueOnce(response({ error: "Unable to send a code to the business contact; contact support or try again later" }, 503));
  await render();
  expect(container.querySelector('a[href^="/contact"]')).toBeNull();
  await act(async () => button("Send verification code").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to send a code");
  expect(container.querySelector('a[href="/contact?listing=%2Fgrenada%2Faudit-cafe"]')?.textContent).toContain("Contact VakayGo about this listing");
  expect(container.querySelector('input[autocomplete="one-time-code"]')).toBeNull();
  expect(container.textContent).not.toContain("Business claim verified");
  expect(button("Send verification code").disabled).toBe(false);
});
