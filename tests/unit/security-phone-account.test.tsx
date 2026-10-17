import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: { id: "a", email: "a@fixture.invalid", role: "traveler" } as { id: string; email: string; role: string } | null, loading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
import SecurityPage from "@/app/(platform)/profile/security/page";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (value: Response) => resolve(value) }; }
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
let gets: (Response | Promise<Response>)[], post: Response | Promise<Response>, put: Response | Promise<Response>;
beforeEach(() => {
  auth.user = { id: "a", email: "a@fixture.invalid", role: "traveler" }; auth.loading = false;
  gets = []; post = response({ sent: true, userId: "a" }); put = response({ verified: true, userId: "a", phone: "+14735550111" });
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn((input: string, options?: RequestInit) => {
    if (!input.startsWith("/api/auth/phone-verify")) return Promise.resolve(response(input.includes("totp") ? { enabled: false } : { status: "none" }));
    if (options?.method === "POST") return Promise.resolve(post);
    if (options?.method === "PUT") return Promise.resolve(put);
    return Promise.resolve(gets.shift() ?? response({ userId: auth.user?.id, verified: false, phone: null }));
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<SecurityPage />)); }
const phone = () => container.querySelector<HTMLInputElement>('input[type="tel"]')!;
const phoneCalls = () => fetchMock.mock.calls.filter(call => String(call[0]).startsWith("/api/auth/phone-verify"));
async function type(input: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function click(text: string) { await act(async () => { const button = [...container.querySelectorAll("button")].find(value => value.textContent?.trim() === text); expect(button).toBeDefined(); button!.click(); }); }

it("clears A's verified number on account switch and ignores late old GETs even when abort is ignored", async () => {
  const late = deferred(); gets.push(response({ userId: "a", phone: "+14735550111", verified: true }));
  await render(); expect(container.textContent).toContain("+14735550111");
  auth.user = { id: "b", email: "b@fixture.invalid", role: "traveler" }; gets.push(late.promise); await render();
  const signal = phoneCalls().at(-1)![1].signal;
  expect(container.textContent).not.toContain("+14735550111");
  auth.user = { id: "a", email: "a@fixture.invalid", role: "traveler" }; gets.push(response({ userId: "a", phone: "+14735550222", verified: true })); await render();
  await act(async () => late.resolve(response({ userId: "b", phone: "+14735550333", verified: true })));
  expect(signal.aborted).toBe(true); expect(container.textContent).toContain("+14735550222"); expect(container.textContent).not.toContain("+14735550333");
});
it("pins requests to the visible account and aborts a late send on logout", async () => {
  const late = deferred(); post = late.promise; await render();
  await type(phone(), "+14735550111"); await click("Send Code");
  const request = phoneCalls().at(-1)!; expect(JSON.parse(request[1].body)).toEqual({ phone: "+14735550111", expectedUserId: "a" });
  auth.user = null; await render(); auth.user = { id: "b", email: "b@fixture.invalid", role: "traveler" }; await render();
  await act(async () => late.resolve(response({ userId: "a", sent: true })));
  expect(request[1].signal.aborted).toBe(true); expect(phone().value).toBe(""); expect(container.textContent).not.toContain("Verification code sent to your phone.");
});
it("never displays a wrong-account status response", async () => {
  gets.push(response({ userId: "b", phone: "+14735550333", verified: true })); await render();
  expect(container.textContent).not.toContain("+14735550333"); expect(phone().value).toBe(""); expect(container.textContent).toContain("Could not load your phone status");
  expect(phoneCalls()[0][0]).toContain("expectedUserId=a");
});
it("requires a matching verified receipt and sends both account and target phone fences", async () => {
  await render(); await type(phone(), "+14735550111"); await click("Send Code");
  await type(container.querySelector<HTMLInputElement>("#phone-verification-code")!, "123456");
  put = response({ userId: "b", phone: "+14735550111", verified: true }); await click("Verify");
  expect(JSON.parse(phoneCalls().at(-1)![1].body)).toEqual({ expectedUserId: "a", phone: "+14735550111", code: "123456" });
  expect(container.textContent).not.toContain("Phone number verified successfully."); expect(container.textContent).toContain("Could not verify your code");
});
it("ends a stalled status read at the deadline instead of leaving the spinner forever", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation((input: string, options?: RequestInit) => {
    if (!input.startsWith("/api/auth/phone-verify")) return Promise.resolve(response(input.includes("totp") ? { enabled: false } : { status: "none" }));
    return new Promise((_resolve, reject) => options!.signal!.addEventListener("abort", () => reject(new Error("deadline")), { once: true }));
  });
  await render(); await act(async () => vi.advanceTimersByTime(15_000));
  expect(phone()).not.toBeNull(); expect(container.textContent).toContain("Could not load your phone status");
});
