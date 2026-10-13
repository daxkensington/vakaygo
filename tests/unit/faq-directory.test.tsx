import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import FaqPage from "@/app/(marketing)/faq/page";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<FaqPage />)); }
type Question = { name: string; acceptedAnswer: { text: string } };
const questions = () => JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!).mainEntity as Question[];
const answer = (name: string) => questions().find(question => question.name === name)!.acceptedAnswer.text;

it("publishes directory guidance in structured answers without offering checkout, guest reservations, protection or launch deadlines", async () => {
  await render();
  expect(answer("How do I book an experience?")).toContain("Online bookings and payments are disabled");
  expect(answer("Can I book as a guest without an account?")).toContain("bookings are currently unavailable");
  expect(answer("How does trip protection work?")).toContain("not currently available");
  expect(answer("How do I list my business?")).toContain("does not enable bookings or payments");
  expect(answer("How does VakayGo verify operators?")).toContain("not a guarantee of service quality");
  expect(questions().map(question => question.acceptedAnswer.text).join(" ")).not.toMatch(/instant confirmation|24-48 hours|within 3-5 business days|automatically fully refunded|covers unforeseen cancellations/i);
});

it("keeps existing-booking support and honest interest/privacy guidance available", async () => {
  await render();
  expect(answer("How do refunds work?")).toContain("existing VakayGo booking");
  expect(answer("What is the cancellation policy?")).toContain("policy recorded with that booking");
  expect(answer("What data does VakayGo collect?")).toContain("does not share your name or contact details");
  expect(answer("How do I reset my password?")).toContain("Email me a sign-in link");
  expect(answer("How do I reset my password?")).not.toContain("Forgot Password");
  expect(container.querySelector('a[href="/contact"]')).not.toBeNull();
});

it("exposes each expanded answer state and keeps its visible answer consistent with structured guidance", async () => {
  await render();
  const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent === "How do I book an experience?")!;
  const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
  expect(button.getAttribute("aria-expanded")).toBe("false"); expect(panel.hidden).toBe(true);
  await act(async () => button.click());
  expect(button.getAttribute("aria-expanded")).toBe("true"); expect(panel.hidden).toBe(false);
  expect(panel.textContent?.trim()).toBe(answer("How do I book an experience?"));
  expect(panel.getAttribute("aria-labelledby")).toBe(button.id);
});

it("finds setup guidance despite surrounding search whitespace and offers support for no matches", async () => {
  await render();
  const input = container.querySelector('input[aria-label="Search frequently asked questions"]') as HTMLInputElement;
  const search = async (value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); };
  await search("  business  ");
  expect(container.textContent).not.toContain("No matching questions found");
  expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent === "How do I list my business?")).toBe(true);
  await search("synthetic-unmatched-question");
  expect(container.textContent).toContain("No matching questions found");
  expect(container.querySelector('a[href="/contact"]')?.textContent).toContain("contact us directly");
});
