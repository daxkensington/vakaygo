import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ value: "" }));
const auth = vi.hoisted(() => ({ user: { email: "owner@example.invalid", emailVerified: false }, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams(query.value) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
import VerifyEmailPage from "@/app/(platform)/auth/verify-email/page";

let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const listingId = "20000000-0000-4000-8000-000000000009";
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  query.value = `error=invalid_token&claim=${listingId}`;
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
