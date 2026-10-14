import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ value: "" }));
const auth = vi.hoisted(() => ({ user: { email: "owner@example.invalid", emailVerified: false } as { email: string; emailVerified: boolean } | null, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams(query.value) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import VerifyEmailPage from "@/app/(platform)/auth/verify-email/page";

let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const listingId = "20000000-0000-4000-8000-000000000009";
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  query.value = `error=invalid_token&claim=${listingId}`;
  auth.user = { email: "owner@example.invalid", emailVerified: false };
  auth.refresh.mockReset();
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

it("shows failed resend in the invalid-token branch, preserves its claim destination and permits retry", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: "Verification delivery is unavailable. Please try again." }, 503)).mockResolvedValueOnce(response({ ok: true }));
  await act(async () => root.render(<VerifyEmailPage />));
  const resend = () => container.querySelector("button")!;
  await act(async () => resend().click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("delivery is unavailable");
  expect(resend().disabled).toBe(false);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ claimListingId: listingId });
  expect(container.querySelector('[role="status"]')).toBeNull();
  await act(async () => resend().click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Verification email sent");
  expect(resend().disabled).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("also exposes network resend failure in the normal branch without claiming success", async () => {
  query.value = "next=%2Fbarbados%2Fsynthetic-cafe";
  fetchMock.mockRejectedValueOnce(new Error("Synthetic network failure"));
  await act(async () => root.render(<VerifyEmailPage />));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ next: "/barbados/synthetic-cafe" });
});

it("offers signed-out expired-token inbox recovery with the exact listing return, while secure sign-in remains separate", async () => {
  auth.user = null;
  const next = "/audit-island/audit-tour?section=contact#inquiry";
  query.value = new URLSearchParams({ token: "synthetic-expired-token", next }).toString();
  fetchMock.mockResolvedValueOnce(response({ error: "This verification link has expired or is invalid. Please request a new one." }, 400))
    .mockResolvedValueOnce(response({ error: "Sign in securely to continue.", requiresPassword: true }, 401));
  await act(async () => root.render(<VerifyEmailPage />));
  expect(container.querySelector("a")).toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/verify-email/confirm");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: "synthetic-expired-token" });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("expired or is invalid");
  const recovery = container.querySelector("a")!;
  expect(recovery.textContent).toBe("Request a new email sign-in link");
  expect(recovery.getAttribute("href")).toBe(`/auth/signin?${new URLSearchParams({ method: "email", next })}`);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => container.querySelector("button")!.click());
  const secure = container.querySelector("a")!;
  expect(secure.textContent).toBe("Continue to secure sign in");
  expect(secure.getAttribute("href")).toBe(`/auth/signin?${new URLSearchParams({ next })}`);
  expect(container.textContent).not.toContain("Request a new email sign-in link");
  expect(container.querySelector("button")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("preserves the validated business claim when signed-out expired-token recovery also receives an unsafe next", async () => {
  auth.user = null;
  query.value = new URLSearchParams({ token: "synthetic-expired-token", claim: listingId, next: "//untrusted.invalid/return" }).toString();
  fetchMock.mockResolvedValueOnce(response({ error: "This verification link has expired or is invalid. Please request a new one." }, 400));
  await act(async () => root.render(<VerifyEmailPage />));
  await act(async () => container.querySelector("button")!.click());
  const recovery = container.querySelector("a")!;
  expect(recovery.textContent).toBe("Request a new email sign-in link");
  expect(recovery.getAttribute("href")).toBe(`/auth/signin?method=email&next=/operator/claim/${listingId}`);
  expect(container.textContent).not.toContain("Continue to secure sign in");
  expect(auth.refresh).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
