import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: null as null | { id: string; emailVerified: boolean; role: string }, loading: false }));
const tracked = vi.hoisted(() => ({ listingInterestSaved: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/analytics", () => ({ analytics: tracked }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import { ListingInterest } from "@/components/listings/listing-interest";
import { outreachDraft } from "@/lib/listing-interest";
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const listingId = "11111111-1111-4111-8111-111111111111";
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.user = null;
  tracked.listingInterestSaved.mockReset();
  fetchMock = vi.fn(() => response({ interested: false })); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(listingPath = "/barbados/business") { await act(async () => root.render(<ListingInterest listingId={listingId} listingPath={listingPath} operatorId="owner" />)); }
it("explains interest and preserves a guest's listing without submitting anything", async () => {
  await render(); expect(fetchMock).not.toHaveBeenCalled();
  expect(container.querySelector('a[href^="/auth/signin"]')?.getAttribute("href")).toBe("/auth/signin?next=%2Fbarbados%2Fbusiness");
  expect(container.textContent).toContain("does not reserve anything"); expect(container.querySelector("input, select, form")).toBeNull();
});
it("records and withdraws interest using only the interest endpoint", async () => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" }; await render();
  expect(tracked.listingInterestSaved).not.toHaveBeenCalled();
  fetchMock.mockImplementationOnce(() => response({ interested: true }));
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Your interest is recorded");
  expect(tracked.listingInterestSaved).toHaveBeenCalledExactlyOnceWith(listingId);
  expect(fetchMock.mock.calls[1][0]).toBe("/api/listings/interest");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ interested: true, noticeVersion: "2026-09-06" });
  fetchMock.mockImplementationOnce(() => response({ interested: false }));
  await act(async () => container.querySelector("button")!.click());
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).interested).toBe(false);
  expect(container.textContent).not.toContain("Your interest is recorded");
  expect(tracked.listingInterestSaved).toHaveBeenCalledTimes(1);
});
it("does not count existing interest loaded by GET", async () => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" };
  fetchMock.mockImplementationOnce(() => response({ interested: true }));
  await render();
  expect(container.textContent).toContain("Your interest is recorded");
  expect(tracked.listingInterestSaved).not.toHaveBeenCalled();
});
it("does not count removal even when the server still reports existing interest", async () => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" };
  fetchMock.mockImplementationOnce(() => response({ interested: true }));
  await render();
  fetchMock.mockImplementationOnce(() => response({ interested: true }));
  await act(async () => container.querySelector("button")!.click());
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).interested).toBe(false);
  expect(tracked.listingInterestSaved).not.toHaveBeenCalled();
});
it.each([false, "true", undefined])("does not count a save without strict confirmation: %s", async interested => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" }; await render();
  fetchMock.mockImplementationOnce(() => response({ interested }));
  await act(async () => container.querySelector("button")!.click());
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).interested).toBe(true);
  expect(tracked.listingInterestSaved).not.toHaveBeenCalled();
});
it("does not count a save when the network rejects it", async () => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" }; await render();
  fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Network unavailable");
  expect(tracked.listingInterestSaved).not.toHaveBeenCalled();
});
it("blocks unverified accounts and business owners in the UI", async () => {
  auth.user = { id: "customer", emailVerified: false, role: "traveler" }; await render();
  expect(container.textContent).toContain("Verify your email"); expect(container.querySelector("button")).toBeNull();
  auth.user = { id: "owner", emailVerified: true, role: "operator" }; await render();
  expect(container.textContent).toContain("Manage your business"); expect(container.querySelector("button")).toBeNull();
});
it("preserves the exact listing query and fragment through email verification without recording interest", async () => {
  const path = "/barbados/business?guests=2#listing-interest";
  auth.user = { id: "customer", emailVerified: false, role: "traveler" }; await render(path);
  expect(container.querySelector('a[href^="/auth/verify-email"]')?.getAttribute("href")).toBe(`/auth/verify-email?next=${encodeURIComponent(path)}`);
  expect(fetchMock.mock.calls.every(call => !call[1]?.method)).toBe(true);
});
it.each(["https://external.invalid", "//external.invalid", "/%2f%2fexternal.invalid"])("drops unsafe auth continuation %s", async path => {
  await render(path);
  expect(container.querySelector('a[href^="/auth/signin"]')?.getAttribute("href")).toBe("/auth/signin");
  auth.user = { id: "customer", emailVerified: false, role: "traveler" }; await render(path);
  expect(container.querySelector('a[href^="/auth/verify-email"]')?.getAttribute("href")).toBe("/auth/verify-email");
});
it("does not report success when the save fails", async () => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" }; await render();
  fetchMock.mockImplementationOnce(() => response({ error: "Please retry.", interested: true }, 503));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Please retry");
  expect(container.textContent).not.toContain("Your interest is recorded");
  expect(tracked.listingInterestSaved).not.toHaveBeenCalled();
});
it("generates a factual invitation for the correct island without customer data", () => {
  const draft = outreachDraft({ id: "listing-id", title: "Synthetic Cafe", islandName: "Aruba", islandSlug: "aruba", slug: "synthetic-cafe", interestedCustomers: 2, claimVerified: false });
  expect(draft).toContain("https://vakaygo.com/aruba/synthetic-cafe"); expect(draft).toContain("claim=listing-id");
  expect(draft).toContain("not reservations or booking requests"); expect(draft).toContain("unsubscribe");
  expect(draft).toContain("Claiming a listing does not activate bookings or checkout");
  expect(draft).toContain("customer bookings and payments go through VakayGo");
  expect(draft).not.toMatch(/weekly payouts|confirmed bookings|lowest commission|60 seconds|pay.on.the.day|book directly|grenada/);
});
