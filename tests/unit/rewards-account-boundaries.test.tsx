import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string; role: string; email: string } | null, loading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
import RewardsPage from "@/app/(platform)/rewards/page";

let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
const response = (value: unknown) => Response.json(value);
const actor = (id: string) => ({ id, role: "traveler", email: `${id}@example.invalid` });
const loyalty = (label: string, points = 1100) => ({ points, tier: "explorer", tierInfo: { name: "Explorer", minPoints: 0, maxPoints: 999, discount: 0, color: "gray" }, nextTier: null, discount: 0,
  transactions: [{ id: label, type: "earned_booking", points: 100, description: label, createdAt: "2026-10-16T12:00:00Z" }], page: 1, hasMore: false });
const referrals = (label: string | null) => ({ referralCode: label, referralLink: label ? `https://vakaygo.com/?ref=${label}` : null, stats: { invited: 1, signedUp: 0, booked: 0, totalEarned: 0 } });
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (value: unknown) => resolve(response(value)) }; }
function reads(label: string, code: string | null = label) { fetchMock.mockResolvedValueOnce(response(loyalty(label))).mockResolvedValueOnce(response(referrals(code))); }
async function render() { await act(async () => root.render(<RewardsPage />)); }
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!; expect(button).toBeDefined(); await act(async () => button.click()); }
beforeEach(() => {
  auth.user = actor("actor-a"); auth.loading = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("hides A's loaded ledger and referral link immediately when B starts loading, then ignores late A reads", async () => {
  reads("Private A ledger", "PRIVATE_A_CODE"); await render();
  expect(container.textContent).toContain("Private A ledger"); expect(container.textContent).toContain("PRIVATE_A_CODE");
  const oldLoyalty = deferred(), oldReferrals = deferred();
  fetchMock.mockReturnValueOnce(oldLoyalty.promise).mockReturnValueOnce(oldReferrals.promise); await click("Earned");
  const oldSignal = fetchMock.mock.calls.at(-1)![1].signal as AbortSignal;
  const nextLoyalty = deferred(), nextReferrals = deferred();
  fetchMock.mockReturnValueOnce(nextLoyalty.promise).mockReturnValueOnce(nextReferrals.promise);
  auth.user = actor("actor-b"); await render();
  expect(oldSignal.aborted).toBe(true); expect(container.textContent).not.toContain("Private A"); expect(container.textContent).not.toContain("PRIVATE_A_CODE");
  await act(async () => { nextLoyalty.resolve(loyalty("Private B ledger")); nextReferrals.resolve(referrals("PRIVATE_B_CODE")); });
  await act(async () => { oldLoyalty.resolve(loyalty("Obsolete A ledger")); oldReferrals.resolve(referrals("OBSOLETE_A_CODE")); });
  expect(container.textContent).toContain("Private B ledger"); expect(container.textContent).toContain("PRIVATE_B_CODE");
  expect(container.textContent).not.toContain("Obsolete A"); expect(container.textContent).not.toContain("OBSOLETE_A_CODE");
});

it("aborts an account's pending referral-code mutation and never installs its late receipt in the next account", async () => {
  reads("Private A ledger", null); await render();
  const creation = deferred(); fetchMock.mockReturnValueOnce(creation.promise); await click("Get Your Referral Link");
  const signal = fetchMock.mock.calls.at(-1)![1].signal as AbortSignal;
  auth.user = actor("actor-b"); reads("Private B ledger", "PRIVATE_B_CODE"); await render();
  expect(signal.aborted).toBe(true);
  await act(async () => creation.resolve({ referralCode: "OLD_A_RECEIPT", referralLink: "https://vakaygo.com/?ref=OLD_A_RECEIPT" }));
  expect(container.textContent).toContain("PRIVATE_B_CODE"); expect(container.textContent).not.toContain("OLD_A_RECEIPT");
});

it.each(["role", "email"])("resets private state when the current account's %s changes", async changed => {
  reads("Old private ledger"); await render();
  const next = deferred(); fetchMock.mockReturnValueOnce(next.promise).mockReturnValueOnce(next.promise);
  auth.user = { ...actor("actor-a"), [changed]: changed === "role" ? "operator" : "changed@example.invalid" }; await render();
  expect(container.textContent).not.toContain("Old private ledger");
});

it("removes private rewards on logout and does not fetch while anonymous or auth is loading", async () => {
  reads("Private A ledger"); await render(); const calls = fetchMock.mock.calls.length;
  auth.user = null; await render(); expect(container.textContent).toContain("Sign in to view rewards"); expect(container.textContent).not.toContain("Private A ledger");
  auth.user = actor("actor-b"); auth.loading = true; await render(); expect(fetchMock).toHaveBeenCalledTimes(calls);
});
