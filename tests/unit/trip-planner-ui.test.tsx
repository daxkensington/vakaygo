import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "synthetic-traveler-one" } as { id: string } | null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
import Planner from "@/app/(platform)/trips/new/page";
let container: HTMLDivElement; let root: Root; let fetchMock: ReturnType<typeof vi.fn>;
const plan = { trip: { id: "30000000-0000-4000-8000-000000000001", title: "Saved synthetic trip" }, itinerary: { title: "Test plan ready", summary: "A suggested day", estimatedBudget: { accommodation: 0, activities: 0, dining: 0, transport: 0, total: 0 }, days: [{ dayNumber: 1, date: "2027-01-01", theme: "A beach day", items: [{ timeSlot: "morning", type: "free", title: "Relax on the beach", listingId: null, listingSlug: null, listingTitle: null, price: 0, rating: null, image: null, note: null }] }] } };
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); state.user = { id: "synthetic-traveler-one" };
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
