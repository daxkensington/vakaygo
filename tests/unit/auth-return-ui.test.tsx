import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const navigation = vi.hoisted(() => ({ query: "" }));
const refresh = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, refresh }) }));
vi.mock("@/lib/analytics", () => ({ analytics: { signUp: vi.fn() } }));
import SignInPage from "@/app/auth/signin/page";
import SignUpPage from "@/app/auth/signup/page";
import ContinuePage from "@/app/auth/continue/page";
import VerifyEmailPage from "@/app/(platform)/auth/verify-email/page";

const listing = "/barbados/synthetic-cafe";
const token = "a".repeat(64);
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); navigation.query = `next=${encodeURIComponent(listing)}`;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, redirect: "/explore", user: { role: "traveler" } })));
  vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function click(text: string) { await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes(text))!.click()); }
async function input(selector: string, value: string) {
  const element = container.querySelector(selector) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("listing continuity through sign-in and signup", () => {
  it("returns password sign-in to the local listing including a legitimate query and fragment", async () => {
    const next = `${listing}?guests=2#business-contact`; navigation.query = `next=${encodeURIComponent(next)}`;
    await render(<SignInPage />); await submit();
    expect(router.push).toHaveBeenCalledExactlyOnceWith(next);
  });

  it.each(["//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/api/auth/google?next=//evil.example"])("drops unsafe password continuation %s", async next => {
    navigation.query = `next=${encodeURIComponent(next)}`; await render(<SignInPage />); await submit();
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/explore");
    expect(container.querySelector('a[href="/auth/signup"]')).not.toBeNull();
  });

  it("keeps the listing when switching to signup and requesting an email link", async () => {
    await render(<SignInPage />);
    expect(container.querySelector(`a[href="/auth/signup?next=${encodeURIComponent(listing)}"]`)).not.toBeNull();
    await input('input[type="email"]', "traveler@example.invalid"); await click("Email me a sign-in link");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/magic-link", expect.objectContaining({ body: JSON.stringify({ email: "traveler@example.invalid", next: listing }) }));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("passes the listing to Google from signin and signup without contacting a provider", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    await render(<SignInPage />); await click("Continue with Google");
    expect(new URL(assign.mock.calls[0][0]).searchParams.get("next")).toBe(listing);
    navigation.query = `role=operator&next=${encodeURIComponent(listing)}`;
    await render(<SignUpPage />); await click("Continue with Google");
    expect(new URL(assign.mock.calls[1][0]).searchParams.get("next")).toBe(listing);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the listing across new-account signup, inbox verification and switching back to signin", async () => {
    navigation.query = `role=operator&next=${encodeURIComponent(listing)}`;
    await render(<SignUpPage />);
    expect(container.querySelector(`a[href="/auth/signin?next=${encodeURIComponent(listing)}"]`)).not.toBeNull();
    await submit();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).next).toBe(listing);
    expect(router.push).toHaveBeenCalledExactlyOnceWith(`/auth/verify-email?next=${encodeURIComponent(listing)}`);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("listing continuity through explicit inbox confirmation", () => {
  it("returns magic-link completion to the listing after refreshing the session", async () => {
    navigation.query += `&token=${token}`; await render(<ContinuePage />); await click("Continue to my account");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/magic-link/verify", expect.objectContaining({ body: JSON.stringify({ token }) }));
    expect(refresh).toHaveBeenCalledOnce(); expect(router.push).toHaveBeenCalledExactlyOnceWith(listing);
  });

  it("retains the listing when an existing two-factor account must use password signin", async () => {
    navigation.query += `&token=${token}`;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ requiresPassword: true }), { status: 403 }));
    await render(<ContinuePage />); await click("Continue to my account");
    expect(router.push).toHaveBeenCalledExactlyOnceWith(`/auth/signin?error=use_password&next=${encodeURIComponent(listing)}`);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("retains the listing on expired email-link recovery and blocks unsafe server redirects", async () => {
    navigation.query += `&token=${token}`;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Expired" }), { status: 400 }));
    await render(<ContinuePage />); await click("Continue to my account");
    expect(container.querySelector(`a[href="/auth/signin?method=email&next=${encodeURIComponent(listing)}"]`)).not.toBeNull();
    navigation.query = `token=${token}&next=${encodeURIComponent("/%2f%2fevil.example")}`;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, redirect: "https://evil.example" })));
    await render(<ContinuePage />); // New mount clears the expired-link state.
    await act(async () => root.unmount()); root = createRoot(container); await render(<ContinuePage />); await click("Continue to my account");
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/explore");
  });

  it("returns confirmed signup email to the listing while preserving recovery links before confirmation", async () => {
    await render(<VerifyEmailPage />);
    expect(container.querySelector(`a[href="/auth/signin?method=email&next=${encodeURIComponent(listing)}"]`)).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    navigation.query += `&token=${token}`; await render(<VerifyEmailPage />); await submit();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(listing);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
