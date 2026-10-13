import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ query: "role=operator" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, refresh }) }));
vi.mock("@/lib/analytics", () => ({ analytics: { signUp: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import SignUpPage from "@/app/auth/signup/page";
import SignInPage from "@/app/auth/signin/page";
import VerifyEmailPage from "@/app/(platform)/auth/verify-email/page";
import ContinuePage from "@/app/auth/continue/page";
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
const listing = "/barbados/synthetic-cafe";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { vi.clearAllMocks(); navigation.query = "role=operator"; vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fetchMock = vi.fn(async () => response({ user: { role: "operator" }, ok: true })); vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function click(text: string) { await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === text)!.click()); }
async function input(selector: string, value: string) { const element = container.querySelector<HTMLInputElement>(selector)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }

it("shows account-created email recovery after provider failure without claiming an email was sent", async () => {
  navigation.query = `role=operator&next=${encodeURIComponent(listing)}`;
  fetchMock.mockResolvedValueOnce(response({ user: { role: "operator" }, verificationEmailSent: false }));
  await render(<SignUpPage />); await submit();
  expect(router.push).toHaveBeenCalledWith(`/auth/verify-email?next=${encodeURIComponent(listing)}&delivery=unavailable`);
  navigation.query = `next=${encodeURIComponent(listing)}&delivery=unavailable`;
  await render(<VerifyEmailPage />);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not confirm");
  expect(container.textContent).not.toContain("We sent a verification link");
  expect(container.querySelector(`a[href="/auth/signin?method=email&next=${encodeURIComponent(listing)}"]`)).not.toBeNull();
});

it("offers inbox recovery instead of a second signup when the account already exists and names its form controls", async () => {
  navigation.query = `role=operator&claim=20000000-0000-4000-8000-000000000009`;
  fetchMock.mockResolvedValueOnce(response({ error: "An account with this email already exists" }, 409));
  await render(<SignUpPage />); await submit();
  expect(container.querySelector('[role="alert"] a')?.getAttribute("href")).toBe("/auth/signin?method=email&next=/operator/claim/20000000-0000-4000-8000-000000000009");
  for (const label of Array.from(container.querySelectorAll("label"))) expect(document.getElementById(label.htmlFor)).not.toBeNull();
  expect(container.querySelector<HTMLInputElement>("#signup-password")!.minLength).toBe(8);
  expect(router.push).not.toHaveBeenCalled();
});

it("lets an undelivered sign-in link be requested again after the existing account cooldown", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  navigation.query = `next=${encodeURIComponent(listing)}`;
  await render(<SignInPage />); await input("#signin-email", "owner@example.invalid"); await click("Email me a sign-in link");
  const retry = () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.startsWith("Try again in") || button.textContent === "Send another sign-in link")!;
  expect(retry().disabled).toBe(true);
  for (let second = 0; second < 60; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(retry().disabled).toBe(false); await click("Send another sign-in link");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: "owner@example.invalid", next: listing });
});

it("clears a previous two-factor challenge when the sign-in identity changes", async () => {
  fetchMock.mockResolvedValueOnce(response({ requires2fa: true }, 401));
  await render(<SignInPage />); await input("#signin-email", "first@example.invalid"); await input("#signin-password", "synthetic-password"); await submit();
  expect(container.querySelector("#signin-totp")).not.toBeNull();
  await input("#signin-email", "second@example.invalid"); expect(container.querySelector("#signin-totp")).toBeNull();
  await submit(); expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: "second@example.invalid", password: "synthetic-password" });
});

it("preserves an explicit business signup choice when retrying Google from sign-in", async () => {
  const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  navigation.query = "role=operator&error=google_denied"; await render(<SignInPage />);
  expect(container.querySelector('a[href="/auth/signup?role=operator"]')).not.toBeNull();
  await click("Continue with Google"); expect(new URL(assign.mock.calls[0][0]).searchParams.get("role")).toBe("operator");
});

it("allows a transient confirmation retry with the same token and exposes missing-token recovery", async () => {
  navigation.query = `token=synthetic-link&next=${encodeURIComponent(listing)}`;
  fetchMock.mockResolvedValueOnce(response({ error: "Synthetic service unavailable" }, 503));
  await render(<ContinuePage />); await click("Continue to my account");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Synthetic service unavailable");
  await click("Try again"); expect(router.push).toHaveBeenCalledWith(listing);
  expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  navigation.query = `next=${encodeURIComponent(listing)}`; await render(<ContinuePage />);
  expect(container.querySelector(`a[href="/auth/signin?method=email&next=${encodeURIComponent(listing)}"]`)).not.toBeNull();
});
