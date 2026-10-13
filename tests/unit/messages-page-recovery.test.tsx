import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const owner = "10000000-0000-4000-8000-000000000001";
const partner = "10000000-0000-4000-8000-000000000002";
const auth = vi.hoisted(() => ({ user: null as null | { id: string; role: string }, loading: false }));
const inbox = vi.hoisted(() => ({
  conversations: [] as { userId: string; name: string; unread: number; lastMessage: string; lastDate: string }[],
  messages: [], unreadCount: 0, isConnected: false, loadingConversations: false, loadingMessages: false,
  conversationError: null as string | null, messageError: null as string | null,
  sendMessage: vi.fn(), fetchConversations: vi.fn(), fetchMessages: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/use-messages", () => ({ useMessages: () => inbox }));
vi.mock("@/components/layout/header", () => ({ Header: () => <header>VakayGo</header> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => null }));
import MessagesPage from "@/app/(platform)/messages/page";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("templates")
    ? { templates: [{ id: "template", title: "Opening hours", content: "We open at nine." }] } : { isTyping: false }))));
  auth.user = { id: owner, role: "operator" };
  inbox.conversations = []; inbox.messages = []; inbox.conversationError = null; inbox.messageError = null;
  inbox.sendMessage.mockResolvedValue(undefined);
  window.history.replaceState({}, "", "/messages");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const render = async () => { await act(async () => root.render(<MessagesPage />)); };
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

it("preserves a valid guest conversation through sign-in and discards malformed partners", async () => {
  const mixedPartner = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  auth.user = null; window.history.replaceState({}, "", `/messages?with=${mixedPartner}`); await render();
  expect(container.querySelector("a")!.getAttribute("href")).toBe(`/auth/signin?next=${encodeURIComponent(`/messages?with=${mixedPartner.toLowerCase()}`)}`);
  window.history.replaceState({}, "", "/messages?with=https://example.invalid");
  await act(async () => root.unmount()); root = createRoot(container); await render();
  expect(container.querySelector("a")!.getAttribute("href")).toBe("/auth/signin?next=%2Fmessages");
});

it("shows retry after a failed inbox load without false empty-success copy", async () => {
  inbox.conversationError = "Conversations could not be loaded."; await render();
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("Retry conversations");
  expect(container.textContent).not.toContain("No messages yet");
});

it("shows retry after a failed thread load without inviting a false empty conversation", async () => {
  window.history.replaceState({}, "", `/messages?with=${partner}`);
  inbox.messageError = "This conversation could not be loaded.";
  inbox.conversations = [{ userId: partner, name: "Traveler", unread: 0, lastMessage: "Hello", lastDate: "2026-10-13T12:00:00Z" }];
  await render();
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("Retry conversation");
  expect(container.textContent).not.toContain("No messages yet");
  expect(container.textContent).not.toContain("Send a message to start");
});

it("locks draft-changing quick replies while sending and retains the original failed draft", async () => {
  window.history.replaceState({}, "", `/messages?with=${partner}`);
  inbox.conversations = [{ userId: partner, name: "Traveler", unread: 0, lastMessage: "Hello", lastDate: "2026-10-13T12:00:00Z" }];
  let rejectSend: (error: Error) => void;
  inbox.sendMessage.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSend = reject; }));
  await render();
  await act(async () => button("Message templates").click());
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Keep this draft");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const template = Array.from(container.querySelectorAll("button")).find(element => element.textContent?.includes("Opening hours"))!;
  expect(template.disabled).toBe(true); expect(button("Message templates").disabled).toBe(true);
  expect(button("Attach file").disabled).toBe(true); expect(textarea.disabled).toBe(true);
  await act(async () => template.click()); expect(textarea.value).toBe("Keep this draft");
  await act(async () => rejectSend!(Error("Temporarily unavailable")));
  expect(textarea.value).toBe("Keep this draft"); expect(textarea.disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("Temporarily unavailable");
});
