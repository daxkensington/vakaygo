import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SkipToContent } from "@/components/layout/skip-to-content";

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(main = true) {
  await act(async () => root.render(<><SkipToContent /><div id="main-content" tabIndex={-1}><header><a href="#navigation">Navigation</a></header>{main ? <main><a href="#content-link">Content link</a></main> : <p>Fallback content</p>}</div></>));
}

it("moves keyboard focus past navigation to the actual main landmark and scrolls it into view", async () => {
  await render(); const link = container.querySelector("a")!, main = container.querySelector("main")!;
  const scroll = vi.spyOn(main, "scrollIntoView").mockImplementation(() => {});
  link.focus();
  const activation = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 0 });
  await act(async () => { link.dispatchEvent(activation); });
  expect(activation.defaultPrevented).toBe(true); expect(document.activeElement).toBe(main);
  expect(main.tabIndex).toBe(-1); expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "start", behavior: "instant" });
});

it("keeps a real fragment link in server-rendered markup and can focus the wrapper when no main exists", async () => {
  expect(renderToStaticMarkup(<SkipToContent />)).toContain('href="#main-content"');
  await render(false); const wrapper = container.querySelector<HTMLDivElement>("#main-content")!;
  const scroll = vi.spyOn(wrapper, "scrollIntoView").mockImplementation(() => {});
  await act(async () => container.querySelector("a")!.click());
  expect(document.activeElement).toBe(wrapper); expect(scroll).toHaveBeenCalledTimes(1);
});

it("preserves native modified-link activation", async () => {
  await render(); const main = container.querySelector("main")!;
  const scroll = vi.spyOn(main, "scrollIntoView").mockImplementation(() => {});
  const activation = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
  await act(async () => container.querySelector("a")!.dispatchEvent(activation));
  expect(activation.defaultPrevented).toBe(false); expect(scroll).not.toHaveBeenCalled();
});

it("skips navigation to the page heading when a legacy page has no main landmark", async () => {
  await act(async () => root.render(<><SkipToContent /><div id="main-content"><header>Navigation</header><h1>Account</h1><button>Content action</button></div></>));
  const heading = container.querySelector("h1")!;
  vi.spyOn(heading, "scrollIntoView").mockImplementation(() => {});
  await act(async () => container.querySelector("a")!.click());
  expect(document.activeElement).toBe(heading);
});
