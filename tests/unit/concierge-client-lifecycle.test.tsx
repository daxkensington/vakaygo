import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";

const navigation = vi.hoisted(() => ({ island: "grenada", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ island: navigation.island }), useRouter: () => ({ push: navigation.push }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => {
  const attributes = { ...props };
  for (const key of ["fill", "priority", "fetchPriority", "quality"]) delete attributes[key];
  return React.createElement("img", attributes);
} }));
import { AIConcierge } from "@/components/chat/ai-concierge";

class Recognition {
  static instances: Recognition[] = [];
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn(); abort = vi.fn();
  constructor() { Recognition.instances.push(this); }
  result(transcript: string) { this.onresult?.({ results: [[{ transcript }]] }); this.onend?.(); }
}
class Playback {
  static instances: Playback[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined); pause = vi.fn();
  constructor() { Playback.instances.push(this); }
}
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve }; }
let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>, telemetry: Mock<NonNullable<Window["gtag"]>>;
beforeEach(() => {
  vi.useFakeTimers(); navigation.island = "grenada";
  Recognition.instances = []; Playback.instances = [];
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("SpeechRecognition", Recognition); vi.stubGlobal("Audio", Playback);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-concierge-audio");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  telemetry = vi.fn<NonNullable<Window["gtag"]>>(); window.gtag = telemetry;
  let replies = 0;
  fetchMock = vi.fn(async (url: string) => url === "/api/tts"
    ? new Response(new Blob(["synthetic audio"], { type: "audio/mpeg" }))
    : Response.json({ message: `Synthetic reply ${++replies}`, listings: [] }));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); delete window.gtag;
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});
async function render() { await act(async () => root.render(<AIConcierge />)); }
async function click(label: string) { await act(async () => {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button, label).not.toBeNull(); button!.click();
}); }
async function finishPlayback(delay: number) { await act(async () => {
  Playback.instances.at(-1)!.onended?.(); await vi.advanceTimersByTimeAsync(delay);
}); }
const chats = () => fetchMock.mock.calls.filter(call => call[0] === "/api/chat");

it("counts concierge use without sending the conversation text to analytics", async () => {
  await render(); await click("Open concierge chat");
  const privateMessage = "Synthetic private travel detail that belongs only in this conversation";
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Message your AI concierge"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, privateMessage);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(JSON.parse(chats()[0][1].body).messages[0].content).toBe(privateMessage);
  expect(telemetry).toHaveBeenCalledWith("event", "ai_concierge", { event_category: "ai", event_label: undefined, value: undefined });
  expect(JSON.stringify(telemetry.mock.calls)).not.toContain(privateMessage);
});

it("continues voice turns with the latest conversation and destination context", async () => {
  await render(); await click("Open concierge chat"); await click("Enter voice mode");
  await finishPlayback(400);
  expect(Recognition.instances).toHaveLength(1);
  await act(async () => Recognition.instances.at(-1)!.result("First spoken request"));
  expect(chats()).toHaveLength(1);
  expect(JSON.parse(chats()[0][1].body).context.island).toBe("grenada");
  navigation.island = "barbados"; await render();
  await finishPlayback(500);
  await act(async () => Recognition.instances.at(-1)!.result("Second spoken request"));
  expect(chats()).toHaveLength(2);
  const second = JSON.parse(chats()[1][1].body);
  expect(second.messages).toEqual([
    { role: "user", content: "First spoken request" },
    { role: "assistant", content: "Synthetic reply 1" },
    { role: "user", content: "Second spoken request" },
  ]);
  expect(second.context.island).toBe("barbados"); expect(second.voiceMode).toBe(true);
});

it("aborts a pending voice request on unmount and ignores its late response", async () => {
  const pending = deferred();
  fetchMock.mockImplementation((url: string) => url === "/api/chat" ? pending.promise : Promise.resolve(new Response(new Blob(["synthetic audio"]))));
  await render(); await click("Open concierge chat"); await click("Enter voice mode"); await finishPlayback(400);
  await act(async () => Recognition.instances.at(-1)!.result("Pending spoken request"));
  const signal = chats()[0][1].signal as AbortSignal;
  await act(async () => root.render(null)); expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(Response.json({ message: "Obsolete reply", listings: [] })));
  expect(fetchMock.mock.calls.filter(call => call[0] === "/api/tts")).toHaveLength(1);
  expect(Playback.instances).toHaveLength(1);
});
