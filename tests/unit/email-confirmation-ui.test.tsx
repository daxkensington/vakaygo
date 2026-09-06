import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null, refresh: vi.fn(async () => {}) }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams("token=synthetic-confirmation-token"),
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import VerifyEmailPage from "@/app/(platform)/auth/verify-email/page";

let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, redirect: "/operator" }), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function renderPage() { await act(async () => root.render(<VerifyEmailPage />)); }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it("does not consume inbox proof or create a session merely by opening a verification link", async () => {
  await renderPage();
  expect(container.textContent).toContain("Confirm your email");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  const password = container.querySelector('input[type="password"]') as HTMLInputElement;
  expect(password.required).toBe(false); expect(password.minLength).toBe(12); expect(password.maxLength).toBe(128);
});

it("consumes the supplied proof only after confirmation and refreshes the established session", async () => {
  await renderPage(); await submit();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/verify-email/confirm", expect.objectContaining({
    method: "POST", body: JSON.stringify({ token: "synthetic-confirmation-token" }),
  }));
  expect(auth.refresh).toHaveBeenCalledTimes(1); expect(router.replace).toHaveBeenCalledWith("/operator");
});

it("shows the provider error and requires regular sign-in when an existing account needs its password or second factor", async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "Use your password and two-factor code to sign in", requiresPassword: true }), { status: 403 }));
  await renderPage(); await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("password and two-factor");
  expect(container.querySelector('a[href="/auth/signin"]')).not.toBeNull();
  expect(container.querySelector('button[type="submit"]')).toBeNull();
  expect(auth.refresh).not.toHaveBeenCalled(); expect(router.replace).not.toHaveBeenCalled();
});
