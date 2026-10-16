import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "synthetic-traveler-one" } as { id: string } | null }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn(async () => {}) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
import Planner from "@/app/(platform)/trips/new/page";
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
const plan = { trip: { id: "30000000-0000-4000-8000-000000000001", title: "Saved synthetic trip" }, itinerary: { title: "Test plan ready", summary: "A suggested day", estimatedBudget: { accommodation: 0, activities: 0, dining: 0, transport: 0, total: 0 }, days: [{ dayNumber: 1, date: "2027-01-01", theme: "A beach day", items: [{ timeSlot: "morning", type: "free", title: "Relax on the beach", listingId: null, listingSlug: null, listingTitle: null, price: 0, rating: null, image: null, note: null }] }] } };
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState(null, "", "/trips/new");
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); state.user = { id: "synthetic-traveler-one" };
  vi.stubGlobal("navigator", { clipboard }); clipboard.writeText.mockResolvedValue();
  fetchMock = vi.fn(async (url: string) => url === "/api/islands" ? Response.json({ islands: [{ id: 1, name: "Grenada", slug: "grenada", country: "GD", listingCount: 10 }] }) : Response.json(plan));
  vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<Planner />)); }
function button(text: string) { const found = [...container.querySelectorAll("button")].find(b => b.textContent?.includes(text)); expect(found, text).toBeDefined(); return found!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function date(id: string, value: string) { await act(async () => { const input = container.querySelector<HTMLInputElement>(`#${id}`)!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("change", { bubbles: true })); }); }
async function preferences() { await render(); await click("Grenada"); await date("trip-start-date", "2027-01-01"); await date("trip-end-date", "2027-01-02"); expect(button("Continue").disabled).toBe(false); await click("Continue"); await click("Continue"); }
it("preserves the planner continuation for guests", async () => {
  state.user = null; await render(); expect(container.querySelector('a[href="/auth/signin?next=%2Ftrips%2Fnew"]')?.textContent).toBe("Sign In");
});
it("preserves the full listing context through sign-in and uses it when the traveler returns", async () => {
  const path = "/trips/new?island=grenada&spot=Sunset%20Sailing%20%26%20Dining#preferences";
  window.history.replaceState(null, "", path); state.user = null; await render();
  const signIn = new URL(container.querySelector<HTMLAnchorElement>('a[href^="/auth/signin"]')!.href);
  expect(signIn.searchParams.get("next")).toBe(path);
  state.user = { id: "synthetic-traveler-one" }; await render();
  await date("trip-start-date", "2027-01-01"); await date("trip-end-date", "2027-01-02");
  expect(button("Continue").disabled).toBe(false); await click("Continue"); await click("Continue");
  expect(container.querySelector("textarea")?.value).toContain('Please include "Sunset Sailing & Dining"');
});
it("shows a retryable provider failure while retaining the chosen dates and island", async () => {
  fetchMock.mockImplementation(async (url: string) => url === "/api/islands" ? Response.json({ islands: [{ id: 1, name: "Grenada", slug: "grenada" }] }) : Response.json({ error: "Trip planning is temporarily unavailable." }, { status: 503 }));
  await preferences(); await click("Generate My Trip"); expect(container.textContent).toContain("Trip planning is temporarily unavailable."); expect(button("Generate My Trip").disabled).toBe(false);
  await click("Back"); await click("Back"); expect(container.querySelector<HTMLInputElement>("#trip-start-date")?.value).toBe("2027-01-01"); expect(button("Continue").disabled).toBe(false);
});
it("recovers a completed result into a usable, private fresh wizard when the account changes", async () => {
  await preferences(); await click("Generate My Trip"); expect(container.textContent).toContain("Test plan ready");
  state.user = { id: "synthetic-traveler-two" }; await render();
  expect(container.textContent).toContain("Plan Your Dream Trip"); expect(container.textContent).not.toContain("Test plan ready");
  expect(container.querySelector<HTMLInputElement>("#trip-start-date")?.value).toBe(""); expect(button("Continue").disabled).toBe(true);
});
it("aborts in-flight generation and discards its result on account change", async () => {
  await preferences(); let captured!: AbortSignal; let finish!: (value: Response) => void;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url === "/api/islands") return Response.json({ islands: [{ id: 1, name: "Grenada", slug: "grenada", country: "GD", listingCount: 10 }] });
    captured = init.signal!; return new Promise(resolve => { finish = resolve; });
  });
  await click("Generate My Trip"); state.user = { id: "synthetic-traveler-two" }; await render(); expect(captured.aborted).toBe(true);
  await act(async () => finish(Response.json(plan))); expect(container.textContent).not.toContain("Test plan ready"); expect(container.textContent).toContain("Plan Your Dream Trip");
});
it("bounds a stalled request and tells the traveler to check for a completed save before retrying", async () => {
  await preferences(); vi.useFakeTimers();
  fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("Aborted")), { once: true })));
  await click("Generate My Trip"); await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(container.textContent).toContain("Check My Trips before trying again"); expect(button("Generate My Trip").disabled).toBe(false);
});
it("recovers a failed destination lookup without losing dates or claiming an empty catalog", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("destinations could not be loaded");
  expect(container.textContent).not.toContain("No destinations are currently available"); expect(button("Continue").disabled).toBe(true);
  await date("trip-start-date", "2027-01-01"); await date("trip-end-date", "2027-01-02");
  await click("Try loading destinations again"); await click("Grenada");
  expect(container.querySelector('[role="alert"]')).toBeNull(); expect(button("Continue").disabled).toBe(false);
  expect(container.querySelector<HTMLInputElement>("#trip-start-date")?.value).toBe("2027-01-01");
  expect(container.querySelector<HTMLInputElement>("#trip-end-date")?.value).toBe("2027-01-02");
  expect(fetchMock.mock.calls.every(call => call[0] === "/api/islands" && call[1].cache === "no-store")).toBe(true);
});
it("distinguishes a successful empty catalog from a stalled retry, bounds the read and recovers", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ islands: [] })); await render();
  expect(container.textContent).toContain("No destinations are currently available"); expect(container.querySelector('[role="alert"]')).toBeNull();
  vi.useFakeTimers();
  fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("Aborted")), { once: true })));
  await click("Try loading destinations again"); await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true); expect(container.querySelector('[role="alert"]')?.textContent).toContain("destinations could not be loaded");
  expect(container.textContent).not.toContain("No destinations are currently available");
  await click("Try loading destinations again"); expect(button("Grenada")).toBeDefined(); expect(container.querySelector('[role="alert"]')).toBeNull();
});

const sharedTrip = () => Response.json({ trip: { ...plan.trip, userId: "synthetic-traveler-one", isPublic: true } });
it("makes an explicit public transition before copying the generated trip's canonical link", async () => {
  await preferences(); await click("Generate My Trip");
  expect(fetchMock.mock.calls.some(call => call[1]?.method === "PATCH")).toBe(false);
  expect(clipboard.writeText).not.toHaveBeenCalled();
  let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click("Share & copy link"); expect(button("Sharing").disabled).toBe(true);
  expect(clipboard.writeText).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("Copied!");
  const call = fetchMock.mock.calls.at(-1)!;
  expect(call[0]).toBe(`/api/trips/${plan.trip.id}`); expect(call[1].method).toBe("PATCH");
  expect(JSON.parse(call[1].body)).toEqual({ isPublic: true });
  await act(async () => finish(sharedTrip()));
  expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/trips/${plan.trip.id}`);
  expect(container.textContent).toContain("Copied!");
});

it.each([503, 200])("keeps sharing retryable without copying an unconfirmed generated trip (%i)", async status => {
  await preferences(); await click("Generate My Trip");
  fetchMock.mockResolvedValueOnce(Response.json(status === 503 ? { error: "Unavailable" } : { trip: { ...plan.trip, userId: state.user!.id, isPublic: false } }, { status }));
  await click("Share & copy link"); expect(clipboard.writeText).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Sharing could not be confirmed");
  expect(button("Share & copy link").disabled).toBe(false);
  fetchMock.mockResolvedValueOnce(sharedTrip()); await click("Share & copy link");
  expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.textContent).toContain("Copied!");
});

it("reports a clipboard failure after sharing and lets the traveler retry", async () => {
  await preferences(); await click("Generate My Trip");
  clipboard.writeText.mockRejectedValueOnce(new Error("Synthetic clipboard failure"));
  fetchMock.mockResolvedValueOnce(sharedTrip()); await click("Share & copy link");
  expect(container.textContent).not.toContain("Copied!");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("trip is shared, but its link could not be copied");
  expect(container.querySelector<HTMLAnchorElement>('[role="alert"] a')?.href).toBe(`${window.location.origin}/trips/${plan.trip.id}`);
  fetchMock.mockResolvedValueOnce(sharedTrip()); await click("Share & copy link");
  expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.textContent).toContain("Copied!");
});

it("does not copy a late sharing receipt after the account changes", async () => {
  await preferences(); await click("Generate My Trip");
  let finish!: (value: Response) => void; let signal!: AbortSignal;
  fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => { signal = init.signal!; return new Promise(resolve => { finish = resolve; }); });
  await click("Share & copy link"); state.user = { id: "synthetic-traveler-two" }; await render();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(sharedTrip()));
  expect(clipboard.writeText).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("Copied!");
  expect(container.textContent).toContain("Plan Your Dream Trip");
});

it("bounds an unresolved clipboard permission prompt and ignores its late completion", async () => {
  await preferences(); await click("Generate My Trip"); vi.useFakeTimers();
  let finishCopy!: () => void;
  clipboard.writeText.mockImplementationOnce(() => new Promise<void>(resolve => { finishCopy = resolve; }));
  fetchMock.mockResolvedValueOnce(sharedTrip()); await click("Share & copy link");
  expect(button("Sharing").disabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(button("Share & copy link").disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("trip is shared, but its link could not be copied");
  expect(container.querySelector<HTMLAnchorElement>('[role="alert"] a')?.href).toBe(`${window.location.origin}/trips/${plan.trip.id}`);
  await act(async () => finishCopy()); expect(container.textContent).not.toContain("Copied!");
  fetchMock.mockResolvedValueOnce(sharedTrip()); await click("Share & copy link");
  expect(container.textContent).toContain("Copied!"); expect(container.querySelector('[role="alert"]')).toBeNull();
});
