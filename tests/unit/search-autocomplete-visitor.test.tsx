import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { SearchAutocomplete } from "@/components/search/search-autocomplete";

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const suggestions = { islands: [{ name: "Grenada", slug: "grenada" }], listings: [{ title: "Sunset boat tour", slug: "sunset-boat", island: "Grenada", islandSlug: "grenada", type: "tour" }] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(350); }); };
async function show(value = "sunset", onEnter = vi.fn()) {
  function Field() { const [query, setQuery] = useState(value); return <SearchAutocomplete value={query} onChange={setQuery} onEnter={onEnter} />; }
  await act(async () => { root.render(<Field />); });
  const input = container.querySelector("input")!;
  await act(async () => { input.focus(); });
  return input;
}
async function key(input: HTMLInputElement, value: string) { await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })); }); }
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => response(suggestions)); vi.stubGlobal("fetch", fetchMock);
  navigation.push.mockReset();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("names and links its combobox and navigates island and listing selections to actual routes", async () => {
  const input = await show(); await tick();
  const popup = container.querySelector('[role="listbox"]')!;
  expect(input.getAttribute("aria-label")).toBe("Search Caribbean listings");
  expect(input.getAttribute("aria-controls")).toBe(popup.id);
  await key(input, "ArrowDown");
  expect(document.getElementById(input.getAttribute("aria-activedescendant")!)?.textContent).toContain("Grenada");
  await key(input, "Enter"); expect(navigation.push).toHaveBeenCalledWith("/grenada");
  await change(input, "sunset boat"); await tick();
  await key(input, "ArrowDown"); await key(input, "ArrowDown"); await key(input, "Enter");
  expect(navigation.push).toHaveBeenLastCalledWith("/grenada/sunset-boat");
});

it("ignores earlier suggestions after the query is cleared and keeps late results closed after blur", async () => {
  let resolveOld!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }));
  const input = await show(); await tick();
  await change(input, "");
  await act(async () => { resolveOld(response(suggestions)); });
  expect(input.value).toBe(""); expect(container.querySelector('[role="listbox"]')).toBeNull();
  let resolveNew!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveNew = resolve; }));
  await change(input, "boat"); await tick();
  await act(async () => { input.blur(); resolveNew(response(suggestions)); });
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => { input.focus(); }); await tick();
  expect(container.querySelector('[role="listbox"]')).not.toBeNull();
});

it("supports explicit search while Escape prevents a delayed popup from reopening", async () => {
  const onEnter = vi.fn(); const input = await show("boat", onEnter);
  await key(input, "Escape"); await tick();
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Search listings"]')!.click(); });
  expect(onEnter).toHaveBeenCalledWith("boat");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Search listings"]')!.type).toBe("button");
});

it("handles malformed or failed suggestion payloads without leaving stale options", async () => {
  fetchMock.mockImplementationOnce(async () => response({ listings: null, islands: [] }));
  const input = await show(); await tick();
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  fetchMock.mockImplementationOnce(async () => response({ error: "unavailable" }, 503));
  await change(input, "boats"); await tick();
  expect(input.getAttribute("aria-expanded")).toBe("false");
});
