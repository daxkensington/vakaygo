import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "a", name: "Traveler A", email: "a@example.invalid", role: "traveler" } as { id: string; name: string; email: string; role: string } | null, loading: false, refresh: vi.fn(async () => {}), signOut: vi.fn(async () => {}) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
import ProfilePage from "@/app/(platform)/profile/page";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const profile = (id: string, phone = "synthetic phone") => ({ user: { id, phone, createdAt: "2020-01-01" }, stats: { bookings: 7, reviews: 3, saved: 4 } });
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (value: Response) => resolve(value) }; }
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: "a", name: "Traveler A", email: "a@example.invalid", role: "traveler" }; auth.loading = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render() { await act(async () => root.render(<ProfilePage />)); }
function button(text: string) { return [...container.querySelectorAll("button")].find(value => value.textContent?.trim() === text)!; }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
const phone = () => container.querySelector<HTMLInputElement>("#profile-phone")!;

it("clears A's phone, stats and draft before B loads and blocks writes until B's own profile arrives", async () => {
  const next = deferred(); fetchMock.mockResolvedValueOnce(response(profile("a", "A private phone"))).mockReturnValueOnce(next.promise);
  await render(); expect(phone().value).toBe("A private phone");
  auth.user = { id: "b", name: "Traveler B", email: "b@example.invalid", role: "traveler" }; await render();
  expect(phone().value).toBe(""); expect(phone().disabled).toBe(true); expect(button("Save Changes").disabled).toBe(true);
  expect(container.textContent).not.toContain("Member since"); await submit(); expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => next.resolve(response(profile("b", "B phone"))));
  expect(phone().value).toBe("B phone"); expect(button("Save Changes").disabled).toBe(false);
  expect(container.querySelector('a[href="/saved"]')?.textContent).toContain("Saved / Wishlist");
  for (const id of ["profile-name", "profile-phone", "profile-email"]) expect(container.querySelector<HTMLInputElement>(`#${id}`)!.labels?.length).toBe(1);
});

it("ignores late A reads through A→B→A even when fetch ignores abort", async () => {
  const old = deferred(); fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(profile("b", "B phone"))).mockResolvedValueOnce(response(profile("a", "fresh A")));
  await render(); const signal = fetchMock.mock.calls[0][1].signal;
  auth.user = { id: "b", name: "B", email: "b@example.invalid", role: "traveler" }; await render();
  auth.user = { id: "a", name: "A", email: "a@example.invalid", role: "traveler" }; await render();
  await act(async () => old.resolve(response(profile("a", "obsolete A"))));
  expect(signal.aborted).toBe(true); expect(phone().value).toBe("fresh A");
});

it("blocks saving a failed or wrong-account profile and supports an explicit retry", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: "unavailable" }, 503)).mockResolvedValueOnce(response(profile("wrong"))).mockResolvedValueOnce(response(profile("a")));
  await render(); expect(container.querySelector('[role="alert"]')).not.toBeNull(); await submit(); expect(fetchMock).toHaveBeenCalledOnce();
  await act(async () => button("Try loading profile again").click()); expect(button("Save Changes").disabled).toBe(true);
  await act(async () => button("Try loading profile again").click()); expect(button("Save Changes").disabled).toBe(false);
});

it("aborts A's pending save on logout and never refreshes B for a late A receipt", async () => {
  const write = deferred(); fetchMock.mockResolvedValueOnce(response(profile("a"))).mockReturnValueOnce(write.promise).mockResolvedValueOnce(response(profile("b", "B phone")));
  await render(); await submit(); await submit(); expect(fetchMock).toHaveBeenCalledTimes(2);
  const signal = fetchMock.mock.calls[1][1].signal;
  auth.user = null; await render(); expect(container.querySelector('a[href="/auth/signin?next=%2Fprofile"]')).not.toBeNull();
  auth.user = { id: "b", name: "B", email: "b@example.invalid", role: "traveler" }; await render();
  await act(async () => write.resolve(response(profile("a", "A receipt"))));
  expect(signal.aborted).toBe(true); expect(phone().value).toBe("B phone"); expect(container.textContent).not.toContain("Profile updated!"); expect(auth.refresh).not.toHaveBeenCalled();
});

it("requires the current account's confirmed save receipt and keeps failed drafts for retry", async () => {
  fetchMock.mockResolvedValueOnce(response(profile("a", "draft"))).mockResolvedValueOnce(response(profile("wrong"))).mockResolvedValueOnce(response(profile("a", "confirmed")));
  await render(); await submit(); expect(container.textContent).not.toContain("Profile updated!"); expect(phone().value).toBe("draft");
  await submit(); expect(phone().value).toBe("confirmed"); expect(auth.refresh).toHaveBeenCalledOnce(); expect(container.textContent).toContain("Profile updated!");
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(phone(), "New unsaved phone"); phone().dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.textContent).not.toContain("Profile updated!");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
