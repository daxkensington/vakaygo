import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
import { parseSearchHistory, useSearchHistory } from "@/lib/use-search-history";

let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
function Harness({ query = "new search" }: { query?: string }) {
  const { searchHistory, saveSearchHistory, clearSearchHistory } = useSearchHistory();
  return <><output>{JSON.stringify(searchHistory)}</output><button onClick={() => { void saveSearchHistory(query); }}>Save</button><button onClick={() => { void clearSearchHistory(); }}>Clear</button></>;
}
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (value: Response) => resolve(value) }; }
const history = (userId: string, queries: string[]) => Response.json({ userId, searches: queries.map(query => ({ query })) });
const shown = () => JSON.parse(container.querySelector("output")!.textContent!) as string[];
async function render() { await act(async () => root.render(<Harness />)); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
beforeEach(() => {
  auth.user = { id: "actor-a" }; auth.loading = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("parses row-object history, bounds and deduplicates queries, and rejects other-account or legacy payloads", () => {
  expect(parseSearchHistory({ userId: "actor-a", searches: [null, "bad", {}, { query: 12 }, { query: "  " }, { query: "  Beach  " }, { query: "beach" }, { query: "x".repeat(200) }, ...Array.from({ length: 20 }, (_, i) => ({ query: `term ${i}` }))] }, "actor-a"))
    .toEqual(["Beach", "x".repeat(120), ...Array.from({ length: 8 }, (_, i) => `term ${i}`)]);
  expect(parseSearchHistory({ userId: "actor-b", searches: [{ query: "private" }] }, "actor-a")).toBeNull();
  expect(parseSearchHistory({ history: ["legacy"] }, "actor-a")).toBeNull();
});

it("does not fetch or write history while anonymous or auth is loading", async () => {
  auth.loading = true; await render(); await click("Save"); await click("Clear");
  auth.loading = false; auth.user = null; await render(); await click("Save"); await click("Clear");
  expect(fetchMock).not.toHaveBeenCalled(); expect(shown()).toEqual([]);
});

it("loads the real API contract and changes history only after successful account-matching writes", async () => {
  fetchMock.mockResolvedValueOnce(history("actor-a", ["old search"])); await render();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/search-history?expectedUserId=actor-a"); expect(shown()).toEqual(["old search"]);
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 })); await click("Save"); expect(shown()).toEqual(["old search"]);
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 })); await click("Clear"); expect(shown()).toEqual(["old search"]);
  fetchMock.mockResolvedValueOnce(Response.json({ userId: "actor-b" }, { status: 201 })); await click("Save"); expect(shown()).toEqual(["old search"]);
  const save = deferred(); fetchMock.mockReturnValueOnce(save.promise); await click("Save"); expect(shown()).toEqual(["old search"]);
  const request = fetchMock.mock.calls.at(-1)![1]; expect(JSON.parse(request.body)).toEqual({ query: "new search", expectedUserId: "actor-a" });
  await act(async () => save.resolve(Response.json({ userId: "actor-a", search: { query: "new search" } }, { status: 201 })));
  expect(shown()).toEqual(["new search", "old search"]);
  fetchMock.mockResolvedValueOnce(Response.json({ userId: "actor-a", ok: true })); await click("Clear"); expect(shown()).toEqual([]);
});

it("aborts account changes and never displays late private reads or saves", async () => {
  const oldRead = deferred(), currentRead = deferred(), save = deferred();
  fetchMock.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(currentRead.promise); await render();
  const oldSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  auth.user = { id: "actor-b" }; await render(); expect(oldSignal.aborted).toBe(true); expect(shown()).toEqual([]);
  await act(async () => currentRead.resolve(history("actor-b", ["current private search"])));
  await act(async () => oldRead.resolve(history("actor-a", ["obsolete private search"])));
  expect(shown()).toEqual(["current private search"]);
  fetchMock.mockReturnValueOnce(save.promise); await click("Save"); const saveSignal = fetchMock.mock.calls.at(-1)![1].signal as AbortSignal;
  auth.user = null; await render(); expect(saveSignal.aborted).toBe(true); expect(shown()).toEqual([]);
  await act(async () => save.resolve(Response.json({ userId: "actor-b" }, { status: 201 }))); expect(shown()).toEqual([]);
});

it("does not let an initial read undo a confirmed clear and serializes subsequent saves", async () => {
  const read = deferred(), clear = deferred(); fetchMock.mockReturnValueOnce(read.promise).mockReturnValueOnce(clear.promise);
  await render(); await click("Clear"); await click("Save"); expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockResolvedValueOnce(Response.json({ userId: "actor-a" }, { status: 201 }));
  await act(async () => clear.resolve(Response.json({ userId: "actor-a", ok: true })));
  expect(fetchMock).toHaveBeenCalledTimes(3); expect(shown()).toEqual(["new search"]);
  await act(async () => read.resolve(history("actor-a", ["old search"]))); expect(shown()).toEqual(["new search"]);
});

it.each(["Save", "Clear"])("still accepts pending history when %s fails before the initial read completes", async action => {
  const read = deferred();
  fetchMock.mockReturnValueOnce(read.promise).mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
  await render(); await click(action); expect(shown()).toEqual([]);
  await act(async () => read.resolve(history("actor-a", ["existing private search"])));
  expect(shown()).toEqual(["existing private search"]);
});
