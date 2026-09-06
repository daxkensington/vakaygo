import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: null as null | { id: string; emailVerified: boolean; role: string }, loading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import { ListingInterest } from "@/components/listings/listing-interest";
import { outreachDraft } from "@/lib/listing-interest";
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.user = null;
  fetchMock = vi.fn(() => response({ interested: false })); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<ListingInterest listingId="11111111-1111-4111-8111-111111111111" listingPath="/barbados/business" operatorId="owner" />)); }
it("explains interest and preserves a guest's listing without submitting anything", async () => {
  await render(); expect(fetchMock).not.toHaveBeenCalled();
  expect(container.querySelector('a[href^="/auth/signin"]')?.getAttribute("href")).toBe("/auth/signin?next=%2Fbarbados%2Fbusiness");
  expect(container.textContent).toContain("does not reserve anything"); expect(container.querySelector("input, select, form")).toBeNull();
});
it("records and withdraws interest using only the interest endpoint", async () => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" }; await render();
  fetchMock.mockImplementationOnce(() => response({ interested: true }));
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Your interest is recorded");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/listings/interest");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ interested: true, noticeVersion: "2026-09-06" });
  fetchMock.mockImplementationOnce(() => response({ interested: false }));
  await act(async () => container.querySelector("button")!.click());
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).interested).toBe(false);
  expect(container.textContent).not.toContain("Your interest is recorded");
});
it("blocks unverified accounts and business owners in the UI", async () => {
  auth.user = { id: "customer", emailVerified: false, role: "traveler" }; await render();
  expect(container.textContent).toContain("Verify your email"); expect(container.querySelector("button")).toBeNull();
  auth.user = { id: "owner", emailVerified: true, role: "operator" }; await render();
  expect(container.textContent).toContain("Manage your business"); expect(container.querySelector("button")).toBeNull();
});
it("does not report success when the save fails", async () => {
  auth.user = { id: "customer", emailVerified: true, role: "traveler" }; await render();
  fetchMock.mockImplementationOnce(() => response({ error: "Please retry." }, 503));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Please retry");
  expect(container.textContent).not.toContain("Your interest is recorded");
});
it("generates a factual invitation for the correct island without customer data", () => {
  const draft = outreachDraft({ id: "listing-id", title: "Synthetic Cafe", islandName: "Aruba", islandSlug: "aruba", slug: "synthetic-cafe", interestedCustomers: 2, claimVerified: false });
  expect(draft).toContain("https://vakaygo.com/aruba/synthetic-cafe"); expect(draft).toContain("claim=listing-id");
  expect(draft).toContain("not reservations or booking requests"); expect(draft).toContain("unsubscribe");
  expect(draft).not.toMatch(/weekly payouts|confirmed bookings|lowest commission|grenada/);
});
