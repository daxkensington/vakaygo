import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessages } from "@/lib/use-messages";
const traveler = "10000000-0000-4000-8000-000000000002", owner = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000003";
const msgId = "40000000-0000-4000-8000-000000000001";
const incoming = { id: msgId, senderId: owner, receiverId: traveler, content: "Owner reply", isRead: false, createdAt: "2026-10-13T12:00:00Z" };
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
let current: ReturnType<typeof useMessages>, root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
function Harness({ user = traveler, partner = owner }: { user?: string | null; partner?: string | null }) {
  const inbox = useMessages(user, partner);
  useEffect(() => { current = inbox; }, [inbox]);
  return <div>{inbox.messages.map(message => <p key={message.id}>{message.content}</p>)}{inbox.messageError && <p role="alert">{inbox.messageError}</p>}</div>;
}
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", undefined);
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return response({ readIds: [msgId] });
    if (init?.method === "POST") return response({ message: { id: msgId, createdAt: incoming.createdAt } });
    return url.includes("?with=") ? response({ messages: [incoming] }) : response({ conversations: [{ userId: owner, name: "Owner", unread: 1, lastMessage: "Owner reply", lastDate: incoming.createdAt }] });
  });
  vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const render = async (props = {}) => { await act(async () => root.render(<Harness {...props} />)); };

describe("inbox send and visible read state", () => {
  it("acknowledges only the loaded incoming message and does not loop when conversations change", async () => {
    await render();
    expect(current.messages[0].isRead).toBe(true);
    const acks = fetchMock.mock.calls.filter(call => call[1]?.method === "PATCH");
    expect(acks).toHaveLength(1); expect(JSON.parse(acks[0][1].body)).toEqual({ with: owner, messageIds: [msgId] });
    expect(fetchMock.mock.calls.filter(call => call[0].includes("?with="))).toHaveLength(1);
  });
  it("rejects a failed send so the composer retains its draft and reuses its identity on retry", async () => {
    await render();
    fetchMock.mockImplementationOnce(() => response({ error: "Temporarily unavailable" }, 503));
    await act(async () => { await expect(current.sendMessage(owner, "My draft")).rejects.toThrow("Temporarily unavailable"); });
    const first = fetchMock.mock.calls.filter(call => call[1]?.method === "POST").at(-1)!;
    await act(async () => current.sendMessage(owner, "My draft"));
    const attempts = fetchMock.mock.calls.filter(call => call[1]?.method === "POST");
    expect(JSON.parse(attempts.at(-1)![1].body).clientMessageId).toBe(JSON.parse(first[1].body).clientMessageId);
    expect(current.conversations[0].lastMessage).toBe("Owner reply");
  });
  it("sends just once for simultaneous identical submits", async () => {
    await render(); let resolveSend: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveSend = resolve; }));
    let first: Promise<void>, second: Promise<void>;
    await act(async () => { first = current.sendMessage(owner, "same draft"); second = current.sendMessage(owner, "same draft"); });
    expect(first!).toBe(second!);
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    await act(async () => { resolveSend!(new Response(JSON.stringify({ message: { id: msgId } }))); await first!; });
  });
  it("settles a confirmed send while its background thread refresh is unresolved", async () => {
    await render();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === "POST"
      ? response({ message: { id: msgId, createdAt: incoming.createdAt } })
      : url.includes("?with=") ? new Promise<Response>(() => {}) : response({ conversations: [] }));
    let settled = false;
    await act(async () => { await current.sendMessage(owner, "Delivered draft").then(() => { settled = true; }); });
    expect(settled).toBe(true);
    expect(current.loadingMessages).toBe(true);
    await act(async () => current.sendMessage(owner, "Next message"));
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(call => call[0].includes("?with=")).at(-1)![1].signal).toBeInstanceOf(AbortSignal);
  });
  it("reports failed thread loading without a false empty-success or read acknowledgment", async () => {
    fetchMock.mockImplementation((url: string) => url.includes("?with=") ? response({ error: "No" }, 503) : response({ conversations: [] }));
    await render(); expect(current.messageError).toContain("could not be loaded"); expect(current.messages).toEqual([]);
    expect(fetchMock.mock.calls.some(call => call[1]?.method === "PATCH")).toBe(false);
  });
  it("lets a stalled read report its error instead of superseding it on every poll or focus", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let rejectThread: (error: Error) => void;
    fetchMock.mockImplementation((url: string) => url.includes("?with=")
      ? new Promise((_resolve, reject) => { rejectThread = reject; }) : response({ conversations: [] }));
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); window.dispatchEvent(new Event("focus")); });
    expect(fetchMock.mock.calls.filter(call => call[0].includes("?with="))).toHaveLength(1);
    await act(async () => rejectThread!(new DOMException("Timed out", "TimeoutError")));
    expect(current.loadingMessages).toBe(false); expect(current.messageError).toBe("Timed out");
    fetchMock.mockImplementation((url: string) => url.includes("?with=") ? response({ messages: [] }) : response({ conversations: [] }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(current.messageError).toBeNull(); expect(current.loadingMessages).toBe(false);
  });
  it("ignores a delayed previous conversation and never acknowledges its unseen messages", async () => {
    let resolveOld: (value: Response) => void;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes(`?with=${owner}`)) return new Promise(resolve => { resolveOld = resolve; });
      return init?.method === "PATCH" ? response({ readIds: [] }) : url.includes("?with=") ? response({ messages: [{ ...incoming, senderId: other, content: "Current conversation", isRead: true }] }) : response({ conversations: [] });
    });
    await render(); await render({ partner: other });
    await act(async () => resolveOld!(new Response(JSON.stringify({ messages: [incoming] }))));
    expect(container.textContent).toContain("Current conversation"); expect(container.textContent).not.toContain("Owner reply");
    expect(fetchMock.mock.calls.some(call => call[1]?.method === "PATCH")).toBe(false);
  });
  it("clears the previous account immediately and ignores its delayed responses", async () => {
    let resolveOld: (value: Response) => void;
    fetchMock.mockImplementation((url: string) => url.includes("?with=") ? new Promise(resolve => { resolveOld = resolve; }) : response({ conversations: [] }));
    await render(); await render({ user: null, partner: null });
    await act(async () => resolveOld!(new Response(JSON.stringify({ messages: [incoming] }))));
    expect(current.messages).toEqual([]); expect(current.conversations).toEqual([]); expect(current.unreadCount).toBe(0);
    expect(fetchMock.mock.calls.some(call => call[1]?.method === "PATCH")).toBe(false);
  });
});
