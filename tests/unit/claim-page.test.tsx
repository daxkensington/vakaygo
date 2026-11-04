import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "operator-a", role: "operator" } as { id: string; role: string } | null, loading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("lucide-react", () => ({ Loader2: () => null }));
import ClaimListingPage from "@/app/operator/claim/[listingId]/page";

const listingId = "20000000-0000-4000-8000-000000000009";
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: "operator-a", role: "operator" }; auth.loading = false; paramsById.clear(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const paramsById = new Map<string, Promise<{ listingId: string }>>();
async function render(id = listingId) {
  if (!paramsById.has(id)) paramsById.set(id, Promise.resolve({ listingId: id }));
  await act(async () => { root.render(<ClaimListingPage params={paramsById.get(id)!} />); });
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

it("keeps a saved review request submitted and shows notification failure with support rather than another submit action", async () => {
  const verification = { state: "not_started", available: false, reason: "trusted_contact_unavailable" };
  const warning = "Your claim was saved for team review, but its email notification could not be sent. You do not need to submit again.";
  fetchMock.mockResolvedValueOnce(response(summary("not_started", { claim: null, verification })))
    .mockResolvedValueOnce(response({ submitted: true, claim: { id: "synthetic-claim", status: "pending" }, notificationWarning: warning }, 201))
    .mockResolvedValueOnce(response(summary("not_started", { verification })));
  await render();
  await act(async () => button("Submit Claim for Team Review").click());
  expect(container.textContent).toContain("Claim request submitted");
  expect(container.querySelector('[role="status"]')?.textContent).toContain(warning);
  expect(container.querySelector('a[href="/contact?listing=%2Fgrenada%2Faudit-cafe"]')?.textContent).toContain("Contact VakayGo about this claim");
  expect(Array.from(container.querySelectorAll("button")).some(item => item.textContent?.includes("Submit Claim"))).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
});
it("does not fabricate a notification warning for a normally saved review request", async () => {
  const verification = { state: "not_started", available: false, reason: "trusted_contact_unavailable" };
  fetchMock.mockResolvedValueOnce(response(summary("not_started", { claim: null, verification })))
    .mockResolvedValueOnce(response({ submitted: true, claim: { id: "synthetic-claim", status: "pending" } }, 201))
    .mockResolvedValueOnce(response(summary("not_started", { verification })));
  await render();
  await act(async () => button("Submit Claim for Team Review").click());
  expect(container.textContent).toContain("Claim request submitted");
  expect(container.textContent).not.toContain("notification could not be sent");
  expect(container.querySelector('[role="status"]')).toBeNull();
});
function delayedResponse() { let resolve!: (response: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (response: Response) => resolve(response) }; }
async function submitVerification() {
  const input = container.querySelector('input[autocomplete="one-time-code"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "123456"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
it.each(["account", "role"] as const)("ignores an old approved POST after the current %s changes even when fetch ignores abort", async change => {
  const old = delayedResponse();
  fetchMock.mockResolvedValueOnce(response(summary("pending"))).mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(change === "role" ? response({ code: "role_required" }, 403) : response({ ...summary(), listing: { ...summary().listing, title: "New account listing" } }));
  await render(); await submitVerification();
  const signal: AbortSignal = fetchMock.mock.calls[1][1].signal;
  auth.user = change === "role" ? { id: "operator-a", role: "traveler" } : { id: "operator-b", role: "operator" };
  await render(); expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response({ claim: { status: "approved" } })));
  expect(router.push).not.toHaveBeenCalled(); expect(router.replace).not.toHaveBeenCalled();
  expect(container.textContent).toContain(change === "role" ? "Switch to a business account" : "New account listing");
  expect(container.textContent).not.toContain("Business claim verified");
});
it("ignores a saved review receipt after navigating to another listing", async () => {
  const old = delayedResponse(), nextId = "20000000-0000-4000-8000-000000000010";
  const verification = { state: "not_started", available: false, reason: "trusted_contact_unavailable" };
  fetchMock.mockResolvedValueOnce(response(summary("not_started", { claim: null, verification }))).mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(response({ ...summary("not_started", { claim: null, verification }), listing: { ...summary().listing, id: nextId, title: "Next listing" } }));
  await render(); await act(async () => button("Submit Claim for Team Review").click());
  const signal: AbortSignal = fetchMock.mock.calls[1][1].signal;
  await render(nextId); expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response({ submitted: true, claim: { id: "old-claim", status: "pending" }, notificationWarning: "Old private warning" }, 201)));
  expect(container.textContent).toContain("Next listing"); expect(container.textContent).not.toContain("Old private warning");
  expect(container.textContent).not.toContain("Claim request submitted");
  expect(button("Submit Claim for Team Review")).toBeDefined(); expect(router.push).not.toHaveBeenCalled();
});
it("bounds an unresponsive POST, requires a status refresh, and ignores its late receipt", async () => {
  const old = delayedResponse();
  const verification = { state: "not_started", available: false, reason: "trusted_contact_unavailable" };
  fetchMock.mockResolvedValueOnce(response(summary("not_started", { claim: null, verification }))).mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(response(summary("not_started", { verification })));
  await render(); vi.useFakeTimers();
  await act(async () => button("Submit Claim for Team Review").click());
  const signal: AbortSignal = fetchMock.mock.calls[1][1].signal;
  await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(signal.aborted).toBe(true); expect(container.querySelector('[role="alert"]')?.textContent).toContain("outcome could not be confirmed");
  expect(button("Submit Claim for Team Review").disabled).toBe(true);
  expect(button("Refresh claim status").disabled).toBe(false);
  await act(async () => button("Refresh claim status").click());
  expect(container.textContent).toContain("Claim request submitted");
  await act(async () => old.resolve(response({ notificationWarning: "Late warning", submitted: true }, 201)));
  expect(container.textContent).not.toContain("Late warning");
  expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
});
it("bounds a stalled status read and allows a new read without accepting the late old response", async () => {
  const old = delayedResponse();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(summary()));
  vi.useFakeTimers(); await render();
  const signal: AbortSignal = fetchMock.mock.calls[0][1].signal;
  await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(signal.aborted).toBe(true); expect(container.querySelector('[role="alert"]')?.textContent).toContain("status could not be loaded");
  expect(button("Try loading again").disabled).toBe(false);
  await act(async () => button("Try loading again").click());
  await act(async () => old.resolve(response({ ...summary(), listing: { ...summary().listing, title: "Late old listing" } })));
  expect(container.textContent).toContain("Audit Cafe"); expect(container.textContent).not.toContain("Late old listing");
});
it("waits for account initialization and sends a signed-out visitor to sign-in without reading private claim state", async () => {
  auth.loading = true; await render(); expect(fetchMock).not.toHaveBeenCalled();
  auth.loading = false; auth.user = null; await render();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledExactlyOnceWith(`/auth/signin?next=${encodeURIComponent(`/operator/claim/${listingId}`)}`);
});
