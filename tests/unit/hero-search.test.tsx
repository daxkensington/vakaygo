import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/image", () => ({ default: ({ fill, priority, fetchPriority, quality, ...props }: React.ComponentProps<"img"> & { fill?: boolean; priority?: boolean; quality?: number }) => {
  void fill; void priority; void fetchPriority; void quality;
  return React.createElement("img", props);
} }));
import { Hero } from "@/components/landing/hero";

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const suggestion = { listings: [{ title: "Cafe", slug: "cafe", island: "Grenada", islandSlug: "grenada", type: "dining" }], islands: [] };
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
async function change(value: string) {
  const input = container.querySelector<HTMLInputElement>("#hero-search")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function debounce() { await act(async () => { await vi.advanceTimersByTimeAsync(200); }); }

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  fetchMock = vi.fn(async () => response(suggestion));
  vi.stubGlobal("fetch", fetchMock);
  push.mockReset();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<Hero />); });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("homepage search", () => {
  it("selects a suggestion without also submitting the search form", async () => {
    await change("cafe"); await debounce();
    const submit = vi.fn(); container.querySelector("form")!.addEventListener("submit", submit);
    const option = container.querySelector<HTMLButtonElement>('[role="option"]')!;
    expect(option.type).toBe("button");
    await act(async () => option.click());
    expect(push.mock.calls).toEqual([["/grenada/cafe"]]);
    expect(submit).not.toHaveBeenCalled();
  });

  it("aborts and ignores an older response after a newer query", async () => {
    let resolveOld!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }));
    await change("old"); await debounce();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await change("cafe"); await debounce();
    await act(async () => { resolveOld(response({ listings: [{ ...suggestion.listings[0], title: "Old result" }], islands: [] })); });
    expect(signal.aborted).toBe(true);
    expect(container.querySelector('[role="listbox"]')!.textContent).toContain("Cafe");
    expect(container.textContent).not.toContain("Old result");
  });

  it("does not reopen suggestions after Escape or clearing the query", async () => {
    let resolvePending!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolvePending = resolve; }));
    await change("cafe"); await debounce();
    await act(async () => { container.querySelector("#hero-search")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await act(async () => resolvePending(response(suggestion)));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await change("cafe again"); await debounce(); await change("");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("leaves ordinary search usable after malformed autocomplete data", async () => {
    fetchMock.mockResolvedValue(response({ listings: null, islands: [] }));
    await change("  sunset & sail  "); await debounce();
    const destination = container.querySelector<HTMLSelectElement>("#hero-destination")!;
    await act(async () => { destination.value = "grenada"; destination.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(push).toHaveBeenCalledWith("/explore?island=grenada&q=sunset+%26+sail");
    expect(container.querySelector("form")!.getAttribute("action")).toBe("/explore");
    expect(destination.name).toBe("island");
  });

  it("reports the keyboard selection through the combobox and opens that result", async () => {
    await change("cafe"); await debounce();
    const input = container.querySelector("#hero-search")!;
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    expect(input.getAttribute("aria-activedescendant")).toBe("hero-option-0");
    expect(container.querySelector("#hero-option-0")!.getAttribute("aria-selected")).toBe("true");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(push).toHaveBeenCalledWith("/grenada/cafe");
  });

  it("cancels pending work on blur and rejects unsafe suggestion destinations", async () => {
    fetchMock.mockResolvedValue(response({ listings: [{ ...suggestion.listings[0], islandSlug: "/outside.example" }], islands: [] }));
    await change("cafe"); await debounce();
    expect(container.querySelector('[role="option"]')).toBeNull();
    let resolvePending!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolvePending = resolve; }));
    await change("next query"); await debounce();
    await act(async () => container.querySelector("#hero-search")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body })));
    await act(async () => resolvePending(response(suggestion)));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("loads a manually chosen image immediately when automatic motion is disabled", async () => {
    expect(container.querySelectorAll("img")).toHaveLength(1);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show image 2"]')!.click());
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.querySelector('[aria-label="Show image 2"]')!.getAttribute("aria-pressed")).toBe("true");
  });
});
