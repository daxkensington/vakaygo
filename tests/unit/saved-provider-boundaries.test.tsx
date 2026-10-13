import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const a = "41000000-0000-4000-8000-000000000001", b = "41000000-0000-4000-8000-000000000002";
const id = "42000000-0000-4000-8000-000000000001";
const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/lib/currency", () => ({ useCurrency: () => ({ format: (amount: number) => String(amount) }) }));
vi.mock("@/components/shared/image-fallback", () => ({ ImageWithFallback: () => null }));
import { SavedProvider, useSaved } from "@/lib/use-saved";
import { ListingCard } from "@/components/listings/listing-card";
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred() { let resolve!: (body: unknown) => void; return { promise: new Promise<unknown>(accept => { resolve = accept; }), resolve: (body: unknown) => resolve(body) }; }
function Consumer() { const saved = useSaved(); return <><p>{saved.isSaved(id) ? "Saved" : "Not saved"}</p><button onClick={() => { void saved.toggle(id); }}>Toggle</button><button onClick={() => { void saved.remove(id); }}>Remove</button><button onClick={() => { void saved.refresh(); }}>Reload</button></>; }
async function render() { await act(async () => root.render(<SavedProvider><Consumer /></SavedProvider>)); }
async function click(text: string) { await act(async () => Array.from(container.querySelectorAll("button")).find(item => item.textContent === text)!.click()); }
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: a }; auth.loading = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("guest save preserves the exact safe destination without a save request or optimistic heart", async () => {
  auth.user = null; window.history.replaceState({}, "", "/explore?q=beach#map");
  await render(); await click("Toggle");
  expect(fetchMock).not.toHaveBeenCalled(); expect(container.querySelector("p")?.textContent).toBe("Not saved");
  expect(router.push).toHaveBeenCalledWith("/auth/signin?next=%2Fexplore%3Fq%3Dbeach%23map");
});
it("clears A saved IDs through logout and uses B identity and B state for the next action", async () => {
  fetchMock.mockResolvedValueOnce(response({ userId: a, saved: [{ id }] })).mockResolvedValueOnce(response({ userId: b, saved: [] }))
    .mockResolvedValueOnce(response({ userId: b, saved: true, listingId: id }));
  await render(); expect(container.querySelector("p")?.textContent).toBe("Saved");
  auth.user = null; await render(); expect(container.querySelector("p")?.textContent).toBe("Not saved");
  auth.user = { id: b }; await render(); await click("Toggle");
  expect(fetchMock.mock.calls[2][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ listingId: id, expectedUserId: b });
  expect(container.querySelector("p")?.textContent).toBe("Saved");
});
it("rejects late A reads after B even if the transport ignores abort", async () => {
  const old = deferred(); fetchMock.mockImplementationOnce(() => old.promise.then(body => response(body)))
    .mockResolvedValueOnce(response({ userId: b, saved: [] }));
  await render(); const signal = fetchMock.mock.calls[0][1].signal;
  auth.user = { id: b }; await render(); expect(signal.aborted).toBe(true);
  await act(async () => old.resolve({ userId: a, saved: [{ id }] }));
  expect(container.querySelector("p")?.textContent).toBe("Not saved");
});
it("rejects a different-cookie account read instead of exposing its saved IDs", async () => {
  fetchMock.mockResolvedValueOnce(response({ userId: b, saved: [{ id }] }));
  await render(); expect(container.querySelector("p")?.textContent).toBe("Not saved"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await click("Toggle"); expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each([503, 200])("keeps state and offers an idempotent retry when a save receipt is rejected or malformed (%i)", async status => {
  fetchMock.mockResolvedValueOnce(response({ userId: a, saved: [] })).mockResolvedValueOnce(response({ userId: a, saved: false, listingId: id }, status))
    .mockResolvedValueOnce(response({ userId: a, saved: true, listingId: id }));
  await render(); await click("Toggle"); expect(container.querySelector("p")?.textContent).toBe("Not saved");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
  await click("Try again"); expect(container.querySelector("p")?.textContent).toBe("Saved");
  expect(fetchMock.mock.calls.slice(1).map(call => call[1].method)).toEqual(["POST", "POST"]);
});
it("serializes duplicate clicks and requires the matching actor/listing receipt", async () => {
  const action = deferred(); fetchMock.mockResolvedValueOnce(response({ userId: a, saved: [] }))
    .mockImplementationOnce(() => action.promise.then(body => response(body)));
  await render(); await click("Toggle"); await click("Toggle"); expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => action.resolve({ userId: b, listingId: id, saved: true }));
  expect(container.querySelector("p")?.textContent).toBe("Not saved"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
it("discards a late A unsave result after B becomes current", async () => {
  const action = deferred(); fetchMock.mockResolvedValueOnce(response({ userId: a, saved: [{ id }] }))
    .mockImplementationOnce(() => action.promise.then(body => response(body))).mockResolvedValueOnce(response({ userId: b, saved: [{ id }] }));
  await render(); await click("Remove"); const signal = fetchMock.mock.calls[1][1].signal;
  auth.user = { id: b }; await render(); expect(signal.aborted).toBe(true);
  await act(async () => action.resolve({ userId: a, listingId: id, removed: true }));
  expect(container.querySelector("p")?.textContent).toBe("Saved"); expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("a manual read cannot overwrite a confirmed action after it was superseded", async () => {
  const read = deferred(); fetchMock.mockResolvedValueOnce(response({ userId: a, saved: [] }))
    .mockImplementationOnce(() => read.promise.then(body => response(body))).mockResolvedValueOnce(response({ userId: a, listingId: id, saved: true }));
  await render(); await click("Reload"); await click("Toggle");
  await act(async () => read.resolve({ userId: a, saved: [] })); expect(container.querySelector("p")?.textContent).toBe("Saved");
});
it("actual cards expose and disable serialized save actions, then re-enable other cards after confirmation", async () => {
  const pending = deferred(); fetchMock.mockResolvedValueOnce(response({ userId: a, saved: [] }))
    .mockImplementationOnce(() => pending.promise.then(body => response(body)));
  const props = { slug: "synthetic", type: "tour", priceAmount: null, priceUnit: null, avgRating: null, reviewCount: 0, parish: null, islandSlug: "audit-island", islandName: "Audit Island", image: null, isFeatured: false };
  await act(async () => root.render(<SavedProvider><ListingCard {...props} id={id} title="First" /><ListingCard {...props} id="42000000-0000-4000-8000-000000000002" title="Second" /></SavedProvider>));
  const buttons = () => Array.from(container.querySelectorAll('button[aria-label="Save listing"],button[aria-label="Unsave listing"]')) as HTMLButtonElement[];
  await act(async () => buttons()[0].click());
  expect(buttons()[0].getAttribute("aria-busy")).toBe("true"); expect(buttons().every(item => item.disabled)).toBe(true);
  await act(async () => buttons()[1].click()); expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve({ userId: a, listingId: id, saved: true }));
  expect(buttons().every(item => !item.disabled)).toBe(true); expect(buttons()[0].getAttribute("aria-label")).toBe("Unsave listing");
});
