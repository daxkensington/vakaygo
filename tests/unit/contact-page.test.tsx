import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import ContactPage from "@/app/(marketing)/contact/page";

let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/contact");
  fetchMock = vi.fn(async () => response({ success: true })); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render() { await act(async () => root.render(<ContactPage />)); }
async function input(id: string, value: string) {
  const element = container.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
async function draft() {
  await input("contact-name", "Synthetic Visitor"); await input("contact-email", "visitor@example.invalid");
  await input("contact-category", "Operator Support"); await input("contact-subject", "Review this listing");
  await input("contact-message", "Please review this synthetic listing.");
}
function dispatchSubmit() { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }
async function submit() { await act(async () => dispatchSubmit()); }

it("associates every field label and carries a validated claim listing into the support draft", async () => {
  window.history.replaceState(null, "", "/contact?listing=%2Fgrenada%2Faudit-cafe"); await render();
  for (const id of ["contact-name", "contact-email", "contact-category", "contact-subject", "contact-message"]) {
    const field = container.querySelector(`#${id}`) as HTMLInputElement;
    expect(field.labels?.length).toBe(1);
  }
  expect((container.querySelector("select") as HTMLSelectElement).value).toBe("Operator Support");
  expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toContain("https://vakaygo.com/grenada/audit-cafe");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not turn an arbitrary external listing query into a support link or draft", async () => {
  window.history.replaceState(null, "", "/contact?listing=https%3A%2F%2Fexternal.invalid%2Fsecret"); await render();
  expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
});

it("keeps the draft and prevents simultaneous sends until provider rejection permits a retry", async () => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>(accept => { resolve = accept; }));
  await render(); await draft();
  await act(async () => { dispatchSubmit(); dispatchSubmit(); });
  expect(fetchMock).toHaveBeenCalledOnce(); expect(container.querySelector("fieldset")!.disabled).toBe(true);
  expect(container.textContent).not.toContain("Message submitted");
  await act(async () => resolve(response({ error: "Please try again." }, 503)));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Please try again");
  expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Please review this synthetic listing.");
  expect(container.querySelector("fieldset")!.disabled).toBe(false);
  await submit();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(JSON.parse(fetchMock.mock.calls[0][1].body));
  expect(container.textContent).toContain("Message submitted");
  expect(container.textContent).not.toMatch(/confirmation to your email|within 24 hours/i);
});

it("requires an explicit successful acceptance response and retains the draft after malformed responses", async () => {
  fetchMock.mockResolvedValueOnce(response({ success: false }));
  await render(); await draft(); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be submitted");
  expect(container.querySelector("form")).not.toBeNull();
  fetchMock.mockResolvedValueOnce(new Response("unexpected response", { status: 503 })); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be submitted");
});

it("bounds a stalled submission and explains its unknown outcome without losing the draft", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  await render(); await draft(); await submit();
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not confirm whether");
  expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Please review this synthetic listing.");
  expect(container.querySelector("fieldset")!.disabled).toBe(false);
  expect(container.textContent).not.toContain("Message submitted");
});
