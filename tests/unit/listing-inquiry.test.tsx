import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListingInquiry } from "@/components/listings/listing-inquiry";

const listingId = "11111111-1111-4111-8111-111111111111";
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function render() { await act(async () => root.render(<ListingInquiry listingId={listingId} listingTitle="Synthetic Tour" />)); }
async function setValue(element: Element, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function fillForm() {
  await setValue(container.querySelector('input[type="email"]')!, "traveler@example.invalid");
  await setValue(container.querySelectorAll('input[type="date"]')[0], "2099-12-10");
  await setValue(container.querySelectorAll('input[type="date"]')[1], "2099-12-12");
  await setValue(container.querySelector("select")!, "4");
  await setValue(container.querySelector("textarea")!, "Can you pick up at our hotel?");
}
async function submit() {
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

it("offers an honest no-account inquiry rather than a booking", async () => {
  await render();
  expect(container.textContent).toContain("No account needed");
  expect(container.textContent).toContain("Ask about availability");
  expect(container.textContent).toContain("a reply is not guaranteed");
  expect(container.textContent).toContain("not a booking or payment");
  expect(container.querySelector('a[href="/privacy#listing-inquiries"]')).not.toBeNull();
  expect(container.querySelector('a[href*="/auth/"]')).toBeNull();
});

it("submits the inquiry fields and shows a non-booking success receipt", async () => {
  fetchMock.mockImplementation(() => response({ success: true, inquiryId: "inquiry-1", duplicate: false }));
  await render(); await fillForm(); await submit();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ listingId, email: "traveler@example.invalid", startDate: "2099-12-10", endDate: "2099-12-12", partySize: 4, message: "Can you pick up at our hotel?", website: "" });
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Inquiry received");
  expect(container.textContent).toContain("This is not a booking, nothing is reserved, and no payment was taken.");
});

it("prevents duplicate submissions before the busy state renders", async () => {
  let resolveRequest!: (value: Response) => void;
  fetchMock.mockImplementation(() => new Promise<Response>(resolve => { resolveRequest = resolve; }));
  await render(); await fillForm();
  await act(async () => {
    const form = container.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(fetchMock).toHaveBeenCalledOnce();
  await act(async () => resolveRequest(new Response(JSON.stringify({ success: true, inquiryId: "inquiry-1" }), { status: 200 })));
  expect(container.textContent).toContain("Inquiry received");
});

it("keeps a saved inquiry distinct from a completed notification and allows retry", async () => {
  fetchMock.mockImplementation(() => response({ error: "Your inquiry is saved, but our team notification did not finish. Please retry in a moment.", code: "INQUIRY_SAVED", inquiryId: "inquiry-1" }, 503));
  await render(); await fillForm(); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Your inquiry is saved");
  expect(container.textContent).toContain("Retry team notification");
  expect(container.querySelector('[role="status"]')).toBeNull();
});

it("shows network and malformed-receipt failures without false success", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  await render(); await fillForm(); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Check your connection");
  fetchMock.mockImplementation(() => response({ success: true }));
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not confirm");
  expect(container.querySelector('[role="status"]')).toBeNull();
});
