import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "owner-a" } as { id: string } | null, loading: false }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn(async () => {}) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/components/ui/breadcrumbs", () => ({ Breadcrumbs: () => null }));
import TripsPage from "@/app/(platform)/trips/page";
import TripDetailPage from "@/app/(platform)/trips/[id]/page";

const id = "30000000-0000-4000-8000-000000000001";
const anotherId = "30000000-0000-4000-8000-000000000002";
const card = (title: string, tripId = id) => ({ id: tripId, title, islandName: null, islandSlug: null, startDate: null, endDate: null, guestCount: 2, budget: null, isAiGenerated: false, itemCount: 1, createdAt: "2027-01-01" });
const detail = (title: string, owner = "owner-a", tripId = id, isPublic = false) => ({ ...card(title, tripId), userId: owner, islandId: null, interests: [], isPublic });
const data = (title: string, owner = "owner-a", tripId = id, isPublic = false) => ({ trip: detail(title, owner, tripId, isPublic), items: [{ id: "synthetic-item", tripId, listingId: null, dayNumber: 1, timeSlot: "morning", customTitle: `${title} private activity`, customNote: null, sortOrder: 0, listing: null }] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred() { let resolve!: (response: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (response: Response) => resolve(response) }; }
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: "owner-a" }; auth.loading = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("navigator", { clipboard }); vi.stubGlobal("confirm", vi.fn(() => true));
  clipboard.writeText.mockResolvedValue();
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function list() { await act(async () => root.render(<TripsPage />)); }
async function trip(tripId = id) { await act(async () => root.render(<TripDetailPage params={Promise.resolve({ id: tripId })} />)); }
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === text || item.getAttribute("aria-label") === text)!;
async function click(text: string) { expect(button(text), text).toBeDefined(); await act(async () => button(text).click()); }
async function title(value: string) {
  const input = container.querySelector('input[aria-label="Trip title"]') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

it("removes account A's loaded cards while B is pending and keeps B failure distinct from empty trips", async () => {
  const next = deferred();
  fetchMock.mockResolvedValueOnce(response({ trips: [card("Private A")] })).mockReturnValueOnce(next.promise).mockResolvedValueOnce(response({ trips: [card("Private B")] }));
  await list(); expect(container.textContent).toContain("Private A");
  auth.user = { id: "owner-b" }; await list();
  expect(container.textContent).not.toContain("Private A"); expect(container.textContent).not.toContain("No trips yet");
  await act(async () => next.resolve(response({ error: "Unavailable" }, 503)));
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).not.toContain("No trips yet");
  await click("Try loading trips again"); expect(container.textContent).toContain("Private B");
});

it("rejects late A list responses after B and a fresh A request, even if fetch ignores abort", async () => {
  const old = deferred();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({ trips: [card("Private B")] })).mockResolvedValueOnce(response({ trips: [card("Fresh A")] }));
  await list(); const signal = fetchMock.mock.calls[0][1].signal;
  auth.user = { id: "owner-b" }; await list(); expect(signal.aborted).toBe(true); expect(container.textContent).toContain("Private B");
  auth.user = { id: "owner-a" }; await list();
  await act(async () => old.resolve(response({ trips: [card("Obsolete A")] })));
  expect(container.textContent).toContain("Fresh A"); expect(container.textContent).not.toContain("Obsolete A");
});

it("clears list data across logout and preserves the guest return destination", async () => {
  fetchMock.mockResolvedValueOnce(response({ trips: [card("Private A")] })).mockResolvedValueOnce(response({ trips: [card("Private B")] }));
  await list(); auth.user = null; await list();
  expect(container.textContent).not.toContain("Private A"); expect(container.querySelector('a[href="/auth/signin?next=%2Ftrips"]')).not.toBeNull();
  auth.user = { id: "owner-b" }; await list(); expect(container.textContent).toContain("Private B");
});

it("discards an old-account deletion receipt instead of removing the new account's card", async () => {
  const deletion = deferred();
  fetchMock.mockResolvedValueOnce(response({ trips: [card("Private A")] })).mockReturnValueOnce(deletion.promise).mockResolvedValueOnce(response({ trips: [card("Private B")] }));
  await list(); await click("Delete Private A");
  const signal = fetchMock.mock.calls[1][1].signal;
  auth.user = { id: "owner-b" }; await list(); expect(signal.aborted).toBe(true);
  await act(async () => deletion.resolve(response({ deleted: true })));
  expect(container.textContent).toContain("Private B"); expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("retains the trip when deletion is unconfirmed and refreshes before another attempt", async () => {
  fetchMock.mockResolvedValueOnce(response({ trips: [card("Private A")] })).mockResolvedValueOnce(response({ deleted: false })).mockResolvedValueOnce(response({ trips: [card("Private A")] }));
  await list(); await click("Delete Private A");
  expect(container.textContent).toContain("Private A"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Deletion could not be confirmed");
  await click("Try loading trips again"); expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("removes A's detail, itinerary and title draft through guest→B pending and forbidden recovery", async () => {
  const next = deferred();
  fetchMock.mockResolvedValueOnce(response(data("Private A"))).mockReturnValueOnce(next.promise).mockResolvedValueOnce(response(data("Private B", "owner-b")));
  await trip(); await click("Edit"); await title("Private A unsaved title");
  auth.user = null; await trip();
  expect(container.textContent).not.toContain("Private A"); expect(container.querySelector("input")).toBeNull();
  expect(container.querySelector(`a[href="/auth/signin?next=${encodeURIComponent(`/trips/${id}`)}"]`)).not.toBeNull();
  auth.user = { id: "owner-b" }; await trip();
  expect(container.textContent).not.toContain("Private A"); expect(container.querySelector("input")).toBeNull();
  await act(async () => next.resolve(response({ error: "Forbidden" }, 403)));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("unavailable to this account");
  await click("Try loading trip again"); expect(container.textContent).toContain("Private B");
});

it("rejects late detail reads after both owner and route transitions", async () => {
  const old = deferred();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(data("Private B", "owner-b", anotherId)));
  await trip(); const signal = fetchMock.mock.calls[0][1].signal;
  auth.user = { id: "owner-b" }; await trip(anotherId); expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response(data("Obsolete A"))));
  expect(container.textContent).toContain("Private B"); expect(container.textContent).not.toContain("Obsolete A");
});

it.each(["save", "share", "delete"] as const)("ignores a late %s receipt after account change, including clipboard and navigation side effects", async action => {
  const mutation = deferred();
  fetchMock.mockResolvedValueOnce(response(data("Private A"))).mockReturnValueOnce(mutation.promise).mockResolvedValueOnce(response(data("Private B", "owner-b")));
  await trip();
  if (action === "save") { await click("Edit"); await title("Old A update"); await click("Save trip title"); }
  else await click(action === "share" ? "Share" : "Delete trip");
  const signal = fetchMock.mock.calls[1][1].signal;
  auth.user = { id: "owner-b" }; await trip(); expect(signal.aborted).toBe(true);
  await act(async () => mutation.resolve(response(action === "delete" ? { deleted: true } : { trip: detail("Old A update", "owner-a", id, true) })));
  expect(container.textContent).toContain("Private B"); expect(container.textContent).not.toContain("Old A update");
  expect(container.textContent).not.toContain("Copied!"); expect(clipboard.writeText).not.toHaveBeenCalled(); expect(router.push).not.toHaveBeenCalled();
});

it.each([503, 200])("does not copy a link or claim success when share is rejected or unconfirmed (%i)", async status => {
  fetchMock.mockResolvedValueOnce(response(data("Private A"))).mockResolvedValueOnce(response(status === 503 ? { error: "Unavailable" } : { trip: detail("Private A") }, status));
  await trip(); await click("Share");
  expect(clipboard.writeText).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("Copied!");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Sharing could not be confirmed");
});

it("copies only the canonical trip link after confirmed explicit sharing and reports clipboard failures truthfully", async () => {
  window.history.replaceState(null, "", `/trips/${id}?private-query=must-not-be-copied`);
  fetchMock.mockResolvedValueOnce(response(data("Private A"))).mockResolvedValueOnce(response({ trip: detail("Private A", "owner-a", id, true) }));
  await trip(); await click("Share");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ isPublic: true });
  expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/trips/${id}`);
  expect(container.textContent).toContain("Copied!");
  clipboard.writeText.mockRejectedValueOnce(new Error("Synthetic clipboard unavailable"));
  fetchMock.mockResolvedValueOnce(response({ trip: detail("Private A", "owner-a", id, true) })); await click("Share trip");
  expect(container.textContent).not.toContain("Copied!");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("trip is shared, but its link could not be copied");
});

it("keeps a failed title draft through status reload and retry without claiming it was saved", async () => {
  fetchMock.mockResolvedValueOnce(response(data("Private A"))).mockResolvedValueOnce(response({ error: "Unavailable" }, 503)).mockResolvedValueOnce(response(data("Private A"))).mockResolvedValueOnce(response({ trip: detail("Retried title") }));
  await trip(); await click("Edit"); await title("Retried title"); await click("Save trip title");
  expect((container.querySelector("input") as HTMLInputElement).value).toBe("Retried title");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await click("Reload trip status"); expect((container.querySelector("input") as HTMLInputElement).value).toBe("Retried title");
  await click("Save trip title"); expect(container.querySelector("h1")?.textContent).toBe("Retried title");
});

it("shows public trips without exposing owner-only mutation controls to another viewer", async () => {
  auth.user = { id: "owner-b" }; fetchMock.mockResolvedValueOnce(response(data("Shared A", "owner-a", id, true)));
  await trip(); expect(container.textContent).toContain("Shared A"); expect(button("Share")).toBeUndefined(); expect(button("Edit")).toBeUndefined(); expect(button("Delete trip")).toBeUndefined();
});

it.each(["list", "detail"] as const)("bounds a stalled %s read and offers retry without a false successful empty result", async surface => {
  vi.useFakeTimers();
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
  if (surface === "list") await list(); else await trip();
  await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("No trips yet");
  expect(button(surface === "list" ? "Try loading trips again" : "Try loading trip again")).toBeDefined();
});

it("bounds an unconfirmed share request and retains the trip without copying its link", async () => {
  fetchMock.mockResolvedValueOnce(response(data("Private A")));
  await trip(); vi.useFakeTimers();
  fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
  await click("Share trip"); await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Sharing could not be confirmed");
  expect(container.textContent).toContain("Private A"); expect(clipboard.writeText).not.toHaveBeenCalled(); expect(button("Share trip").disabled).toBe(false);
});
