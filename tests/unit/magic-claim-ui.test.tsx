import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const navigation = vi.hoisted(() => ({ query: "" }));
const refresh = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ refresh }) }));
import ContinuePage from "@/app/auth/continue/page";

const id = "20000000-0000-4000-8000-000000000009";
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  navigation.query = `token=${"a".repeat(64)}&claim=${id}`;
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, redirect: "/explore" }), { headers: { "Content-Type": "application/json" } }));
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

it("returns a signed-in owner to the listing claim", async () => {
  await act(async () => { root.render(<ContinuePage />); });
  await act(async () => { container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(router.push).toHaveBeenCalledExactlyOnceWith(`/operator/claim/${id}`);
});

it("keeps the listing when the account must use a password", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ requiresPassword: true }), { status: 403 }));
  await act(async () => { root.render(<ContinuePage />); });
  await act(async () => { container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(router.push).toHaveBeenCalledExactlyOnceWith(`/auth/signin?error=use_password&next=/operator/claim/${id}`);
});

it("drops a claim value that is not a listing id", async () => {
  navigation.query = `token=${"c".repeat(64)}&claim=https://evil.example`;
  await act(async () => { root.render(<ContinuePage />); });
  await act(async () => { container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/explore");
});
