import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import { ContactInfo } from "@/components/listings/contact-info";
import { ContactOperator } from "@/components/listings/contact-operator";

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const listingId = "20000000-0000-4000-8000-000000000001";
const listingPath = "/barbados/synthetic-business";
const operatorProps = { operatorId: "owner", operatorName: "Business owner", listingId, listingTitle: "Synthetic business", listingPath };
const response = (status = 200) => Promise.resolve(new Response(JSON.stringify({ message: { id: "message-id" } }), { status }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.user = null;
  fetchMock = vi.fn(() => response());
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
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
async function openMessage(message = "Hi, are you open on Sunday?") {
  await act(async () => container.querySelector("button")!.click());
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, message);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return textarea;
}
async function submitMessage() {
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

describe("public business contact", () => {
  it("withholds direct external contact links pre-booking while showing VakayGo protection and claim link", async () => {
    await render(<ContactInfo listingId={listingId} unclaimed typeData={{ phone: "+1 (246) 555-0123 ext. 45", website: "https://www.example.com/long/path?ref=directory", googleMapsUrl: "https://maps.google.com/?q=business" }} />);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.querySelector('a[href^="https://www.example.com"]')).toBeNull();
    expect(container.querySelector('a[href^="https://maps.google.com"]')).toBeNull();
    expect(container.textContent).toContain("Protected by VakayGo");
    expect(container.textContent).toContain("Direct operator contact details");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/auth/signup?role=operator&claim=${listingId}`);
    expect(container.querySelector("form, input, button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits unsafe destinations and malformed contact data while retaining valid hours", async () => {
    await render(<ContactInfo typeData={{ phone: { value: "5555555" }, website: "javascript:alert(1)", googleMapsUrl: "https://user:password@example.com", hours: [{ day: "Monday" }, null, "", "  Monday: 9am–5pm  "] }} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("Monday: 9am–5pm");
    expect(container.textContent).not.toContain("[object Object]");
    await render(<ContactInfo typeData={{ phone: "javascript:alert(1)", hours: {} }} />);
    expect(container.textContent).toBe("");
  });

  it("describes in-app messaging and booking unlock for eligible listings", async () => {
    await render(<ContactInfo bookingEligible typeData={{ website: "https://example.com" }} />);
    expect(container.textContent).toContain("Protected by VakayGo");
    expect(container.textContent).toContain("Message the operator in-app");
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("operator messages", () => {
  it("returns a guest to the listing after sign-in", async () => {
    await render(<ContactOperator {...operatorProps} />);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/auth/signin?next=${encodeURIComponent(listingPath)}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains a failed draft, announces the error and allows a successful retry", async () => {
    auth.user = { id: "traveler" };
    fetchMock.mockImplementationOnce(() => response(503));
    await render(<ContactOperator {...operatorProps} />);
    const textarea = await openMessage("  Are you open on Sunday?  ");
    expect(document.activeElement).toBe(textarea);
    expect(container.querySelector(`label[for="${textarea.id}"]`)?.textContent).toBe("Your message");
    expect(container.querySelector('[aria-label="Close message form"]')).not.toBeNull();
    await submitMessage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be sent");
    expect(textarea.value).toBe("  Are you open on Sunday?  ");
    expect(container.querySelector('[role="status"]')).toBeNull();
    await submitMessage();
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toMatchObject({ receiverId: "owner", content: "Are you open on Sunday?", listingId, clientMessageId: expect.any(String) });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Message sent to Business owner");
    expect(container.querySelector('a[href="/messages?with=owner"]')).not.toBeNull();
    expect(container.textContent).not.toContain("They'll reply");
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("reports connection failures without clearing the draft or reporting success", async () => {
    auth.user = { id: "traveler" };
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await render(<ContactOperator {...operatorProps} />);
    const textarea = await openMessage();
    await submitMessage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Check your connection");
    expect(textarea.value).toContain("Sunday");
    expect(container.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("offers sign-in with the listing preserved when the session expires", async () => {
    auth.user = { id: "traveler" };
    fetchMock.mockImplementationOnce(() => response(401));
    await render(<ContactOperator {...operatorProps} />);
    await openMessage();
    await submitMessage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Your session has expired");
    expect(container.querySelector('[role="alert"] a')?.getAttribute("href")).toBe(`/auth/signin?next=${encodeURIComponent(listingPath)}`);
  });

  it("suppresses duplicate submits and reuses the send identity after an ambiguous connection failure", async () => {
    auth.user = { id: "traveler" };
    let rejectSend: (error: Error) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSend = reject; }));
    await render(<ContactOperator {...operatorProps} />); await openMessage();
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const first = JSON.parse(fetchMock.mock.calls[0][1].body).clientMessageId;
    await act(async () => rejectSend!(new Error("connection lost after save")));
    await submitMessage();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).clientMessageId).toBe(first);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it("clears the previous listing draft and ignores its delayed response after changing listings", async () => {
    auth.user = { id: "traveler" };
    let resolveSend: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveSend = resolve; }));
    await render(<ContactOperator {...operatorProps} />); await openMessage("private old listing draft");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await render(<ContactOperator {...operatorProps} listingId="20000000-0000-4000-8000-000000000002" listingTitle="Another business" />);
    await act(async () => resolveSend!(new Response(JSON.stringify({ message: { id: "saved-old" } }))));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).not.toContain("private old listing");
    await openMessage(""); expect(container.querySelector("textarea")?.value).toBe("");
  });
});
