import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const navigation = vi.hoisted(() => ({ query: "role=operator" }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, refresh: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ analytics: { signUp: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import SignUpPage from "@/app/auth/signup/page";
import SignInPage from "@/app/auth/signin/page";
import VerifyEmailPage from "@/app/(platform)/auth/verify-email/page";

let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); navigation.query = "role=operator";
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: { role: "operator", emailVerified: false } }), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it("sends a successful signup to inbox verification without attempting password sign-in or opening the business area", async () => {
  await act(async () => root.render(<SignUpPage />)); await submit();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/signup", expect.objectContaining({ method: "POST" }));
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/auth/verify-email");
});

it("offers unauthenticated email-link recovery instead of a resend button that requires an existing session", async () => {
  navigation.query = ""; await act(async () => root.render(<VerifyEmailPage />));
  expect(container.querySelector('a[href="/auth/signin?method=email"]')?.textContent).toContain("email sign-in link");
  expect(container.textContent).toContain("You do not need to be signed in");
  expect(container.querySelector("button")).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps inbox recovery visible when password sign-in rejects an unverified account", async () => {
  navigation.query = "method=email";
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "Verify your email before signing in" }), { status: 403 }));
  await act(async () => root.render(<SignInPage />)); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Verify your email");
  expect(container.textContent).toContain("Email not verified");
  expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent?.trim() === "Email me a sign-in link")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(router.push).not.toHaveBeenCalled();
});
