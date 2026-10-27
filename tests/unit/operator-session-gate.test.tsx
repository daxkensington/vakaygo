import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; role: string; name: string; businessName: null },
  loading: true,
  signOut: vi.fn(),
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/operator/bookings" }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => navigation.pathname }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/ui/focus-trap", () => ({ useFocusTrap: vi.fn() }));

import OperatorLayout from "@/app/operator/dashboard-shell";
import { OPERATOR_SESSION_EXPIRED, operatorFetch } from "@/lib/operator-session";

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const mounted = vi.fn();
const unmounted = vi.fn();
const user = (role: string) => ({ id: "synthetic-owner", role, name: "Owner", businessName: null });

function ProtectedPage() {
  useEffect(() => {
    mounted();
    return () => { unmounted(); };
  }, []);
  return <div>Private booking details<button onClick={() => { void operatorFetch("/api/operator/bookings"); }}>Load bookings</button></div>;
}

async function render() {
  await act(async () => { root.render(<OperatorLayout><ProtectedPage /></OperatorLayout>); });
}

function location(path: string) {
  window.history.replaceState(null, "", path);
  navigation.pathname = window.location.pathname;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.loading = true;
  location("/operator/bookings?status=pending#booking-123");
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("operator authentication gate", () => {
  it.each([null, user("operator")])("does not mount protected content while the session is loading, including a cached account", async cachedUser => {
    auth.user = cachedUser;
    await render();
    expect(mounted).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Private booking details");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("redirects an anonymous visit with its query and fragment intact without mounting protected content", async () => {
    auth.loading = false;
    await render();
    const href = `/auth/signin?next=${encodeURIComponent("/operator/bookings?status=pending#booking-123")}`;
    expect(router.replace).toHaveBeenCalledWith(href);
    expect(mounted).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Private booking details");
    expect(container.querySelector(`a[href="${href}"]`)?.textContent).toMatch(/sign in/i);
  });

  it("waits for the initial session check before deciding whether to redirect", async () => {
    await render();
    expect(router.replace).not.toHaveBeenCalled();
    auth.loading = false;
    await render();
    expect(router.replace).toHaveBeenCalledWith(`/auth/signin?next=${encodeURIComponent("/operator/bookings?status=pending#booking-123")}`);
    expect(mounted).not.toHaveBeenCalled();
  });

  it.each(["operator", "admin"])("mounts protected content for an authenticated %s", async role => {
    auth.user = user(role);
    auth.loading = false;
    await render();
    expect(mounted).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Private booking details");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("allows an authenticated traveler to reach the business claim upgrade flow", async () => {
    auth.user = user("traveler");
    auth.loading = false;
    location("/operator/claim/20000000-0000-4000-8000-000000000009");
    await render();
    expect(mounted).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("removes protected children when the current account becomes signed out", async () => {
    auth.user = user("operator");
    auth.loading = false;
    await render();
    expect(mounted).toHaveBeenCalledOnce();
    auth.user = null;
    await render();
    expect(unmounted).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Private booking details");
    expect(router.replace).toHaveBeenCalledWith(`/auth/signin?next=${encodeURIComponent("/operator/bookings?status=pending#booking-123")}`);
  });

  it.each([true, false])("keeps the operator terms public while session loading is %s", async loading => {
    auth.loading = loading;
    location("/operator/onboarding/terms");
    await render();
    expect(mounted).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("does not extend the public terms exception to a nested protected route", async () => {
    auth.loading = false;
    location("/operator/onboarding/terms/private");
    await render();
    expect(mounted).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(`/auth/signin?next=${encodeURIComponent("/operator/onboarding/terms/private")}`);
  });

  it("removes protected children when an operator endpoint rejects an expired session and retains the active route", async () => {
    auth.user = user("operator");
    auth.loading = false;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }));
    await render();
    expect(container.textContent).toContain("Private booking details");
    await act(async () => { container.querySelector("main button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(unmounted).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Private booking details");
    expect(router.replace).toHaveBeenCalledWith(`/auth/signin?next=${encodeURIComponent("/operator/bookings?status=pending#booking-123")}`);
  });

  it("recovers the active claim route when a successful session check reports no current user", async () => {
    auth.user = user("operator");
    auth.loading = false;
    const destination = "/operator/claim/20000000-0000-4000-8000-000000000009?channel=sms#verify";
    location(destination);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ user: null }), { status: 200 }));
    await render();
    await act(async () => { await operatorFetch("/api/auth/session"); });
    expect(unmounted).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Private booking details");
    expect(router.replace).toHaveBeenCalledWith(`/auth/signin?next=${encodeURIComponent(destination)}`);
  });

  it("preserves the current route after a session-expiry event during navigation", async () => {
    auth.user = user("operator");
    auth.loading = false;
    await render();
    location("/operator/settings?tab=payouts#bank-account");
    await render();
    await act(async () => { window.dispatchEvent(new Event(OPERATOR_SESSION_EXPIRED)); });
    expect(router.replace).toHaveBeenCalledWith(`/auth/signin?next=${encodeURIComponent("/operator/settings?tab=payouts#bank-account")}`);
    expect(container.textContent).not.toContain("Private booking details");
  });

  it.each(["account", "role"] as const)("ignores a late unauthorized request without an abort signal after the current %s changes", async change => {
    auth.user = user("operator");
    auth.loading = false;
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(accept => { resolve = accept; }));
    await render();
    await act(async () => { container.querySelector("main button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/operator/bookings", undefined);

    auth.user = change === "account" ? { ...user("operator"), id: "synthetic-owner-b" } : user("admin");
    await render();
    await act(async () => { resolve(new Response("Unauthorized", { status: 401 })); });
    expect(container.textContent).toContain("Private booking details");
    expect(router.replace).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("ignores an old shell's late unauthorized request after leaving and reopening the dashboard", async () => {
    auth.user = user("operator");
    auth.loading = false;
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(accept => { resolve = accept; }));
    await render();
    await act(async () => { container.querySelector("main button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await render();
    await act(async () => { resolve(new Response("Unauthorized", { status: 401 })); });
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Private booking details");
    expect(router.replace).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
