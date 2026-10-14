import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth-context";
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
let controls: ReturnType<typeof useAuth>;
const user = { id: "synthetic-owner", email: "owner@example.invalid", role: "operator", name: "Owner", avatarUrl: null, businessName: null, emailVerified: true };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function Consumer() { const auth = useAuth(); useEffect(() => { controls = auth; }, [auth]); return <div>{auth.loading ? "Loading" : auth.user?.email || "Signed out"}</div>; }
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fetchMock = vi.fn(async () => response({ user })); vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<AuthProvider><Consumer /></AuthProvider>)); }

it("never revives an account from a session response that arrives after confirmed sign-out", async () => {
  await render(); let resolveOld!: (value: Response) => void;
  fetchMock.mockImplementation((url: string) => url === "/api/auth/session" ? new Promise<Response>(resolve => { resolveOld = resolve; }) : Promise.resolve(response({ success: true })));
  let pending!: Promise<void>;
  await act(async () => { pending = controls.refresh(); });
  await act(async () => controls.signOut()); expect(container.textContent).toBe("Signed out");
  await act(async () => { resolveOld(response({ user })); await pending; });
  expect(container.textContent).toBe("Signed out");
});

it("keeps the newer session refresh when an earlier account snapshot completes last", async () => {
  await render(); const pending: ((value: Response) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise<Response>(resolve => pending.push(resolve)));
  let first!: Promise<void>; let second!: Promise<void>;
  await act(async () => { first = controls.refresh(); second = controls.refresh(); });
  await act(async () => { pending[1](response({ user: null })); await second; pending[0](response({ user })); await first; });
  expect(container.textContent).toBe("Signed out");
});

it("does not claim sign-out when its HTTP request failed and allows a later retry", async () => {
  await render(); fetchMock.mockResolvedValueOnce(response({ error: "unavailable" }, 500));
  await act(async () => { await expect(controls.signOut()).rejects.toThrow("could not be confirmed"); });
  expect(container.textContent).toBe(user.email);
  fetchMock.mockResolvedValueOnce(response({ success: true })); await act(async () => controls.signOut());
  expect(container.textContent).toBe("Signed out");
});
