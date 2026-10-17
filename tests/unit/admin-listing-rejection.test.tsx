import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }), useSearchParams: () => navigation.params }));
import AdminListingsPage from "@/app/admin/listings/page";

let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
let patch: () => Promise<Response>;
const listing = { id: "owned-listing", title: "Owned tour", type: "tour", status: "pending_review", priceAmount: "20.00", avgRating: "0", reviewCount: 0, isFeatured: false, createdAt: "2026-10-16T00:00:00.000Z", operatorName: "Owned operator", islandName: "Grenada" };
beforeEach(() => {
  navigation.params = new URLSearchParams(); navigation.push.mockReset();
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  patch = async () => new Response(JSON.stringify({ listing: { id: listing.id, status: "rejected" } }));
  fetchMock = vi.fn((_input: string, options?: RequestInit) => options?.method === "PATCH" ? patch() : Promise.resolve(new Response(JSON.stringify({ listings: [listing], total: 1, page: 1, totalPages: 1 }))));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]');
const patches = () => fetchMock.mock.calls.filter(call => call[1]?.method === "PATCH");
async function open() {
  await act(async () => root.render(<AdminListingsPage />));
  const actions = container.querySelector<HTMLTableRowElement>("tbody tr")!.querySelectorAll("button");
  await act(async () => actions[actions.length - 1].click());
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === "Reject")!.click());
}
async function type(reason: string) {
  const input = dialog()!.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, reason); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function confirm() { await act(async () => [...dialog()!.querySelectorAll("button")].find(button => button.textContent?.trim() === "Reject")!.click()); }

it("sends the entered trimmed rejection reason through the existing PATCH contract and closes only on success", async () => {
  await open();
  expect([...dialog()!.querySelectorAll("button")].find(button => button.textContent?.trim() === "Reject")!.disabled).toBe(true);
  await type("  Please correct the meeting point.  "); await confirm();
  expect(patches()).toHaveLength(1);
  expect(patches()[0][0]).toBe("/api/admin/listings/owned-listing");
  expect(JSON.parse(patches()[0][1].body)).toEqual({ status: "rejected", rejectionReason: "Please correct the meeting point." });
  expect(dialog()).toBeNull();
  expect(container.textContent).toContain('"Owned tour" rejected');
});

it.each(["http", "network"])("keeps the listing and typed reason available after a %s failure and closes after a successful retry", async failure => {
  patch = failure === "http" ? async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }) : async () => { throw new Error("Offline"); };
  await open(); await type("Keep this moderation reason."); await confirm();
  expect(dialog()).not.toBeNull();
  expect(dialog()!.textContent).toContain("Owned tour");
  expect(dialog()!.querySelector("textarea")!.value).toBe("Keep this moderation reason.");
  expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain("Your reason has been kept");
  expect([...dialog()!.querySelectorAll("button")].find(button => button.textContent?.trim() === "Reject")!.disabled).toBe(false);
  patch = async () => new Response(JSON.stringify({ listing: { id: listing.id, status: "rejected" } }));
  await confirm();
  expect(patches()).toHaveLength(2);
  expect(JSON.parse(patches()[1][1].body).rejectionReason).toBe("Keep this moderation reason.");
  expect(dialog()).toBeNull();
});
