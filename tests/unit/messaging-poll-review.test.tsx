import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMessages } from "@/lib/use-messages";

let current: ReturnType<typeof useMessages>, root: Root, container: HTMLDivElement;
function Inbox({ partner = null }: { partner?: string | null }) { const inbox = useMessages("10000000-0000-4000-8000-000000000001", partner); useEffect(() => { current = inbox; }, [inbox]); return null; }
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("EventSource", undefined);
  vi.spyOn(AbortSignal, "timeout").mockImplementation(milliseconds => { const controller = new AbortController(); setTimeout(() => controller.abort(Error("Messages request timed out")), milliseconds); return controller.signal; });
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => { options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true }); })));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("surfaces a stalled initial inbox timeout even while fallback polling is enabled", async () => {
  await act(async () => root.render(<Inbox />));
  await act(async () => vi.advanceTimersByTimeAsync(21000));
  expect(current.conversationError).not.toBeNull(); expect(current.loadingConversations).toBe(false);
});
it("does not let successful thread refreshes hide a stalled conversations timeout", async () => {
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => url.includes("?with=")
    ? Promise.resolve(new Response(JSON.stringify({ messages: [] })))
    : new Promise((_resolve, reject) => { options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true }); })));
  await act(async () => root.render(<Inbox partner="10000000-0000-4000-8000-000000000002" />));
  await act(async () => vi.advanceTimersByTimeAsync(21000));
  expect(current.conversationError).not.toBeNull(); expect(current.loadingConversations).toBe(false);
});
