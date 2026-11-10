import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// jsdom cannot produce a trusted event; a test marks the ones the browser "made".
vi.mock("@/lib/view-attribution", async (original) => ({
  ...(await original<typeof import("@/lib/view-attribution")>()),
  isHumanInput: (event: { real?: boolean }) => event.real === true,
}));
import { useListingViewBeacon } from "@/components/listings/use-listing-view-beacon";

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState;
let webdriver: boolean;

function Page({ slug }: { slug: string }) { useListingViewBeacon(slug, "dominican-republic"); return null; }
const render = async (slug = "la-ex-tours") => { await act(async () => { root.render(<Page slug={slug} />); }); };
function input(type: string, real = true) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { real });
  window.dispatchEvent(event);
}
const beacons = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/view"));

beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", fetchMock);
  visibility = "visible"; webdriver = false;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(navigator, "webdriver", "get").mockImplementation(() => webdriver);
  vi.spyOn(document, "referrer", "get").mockReturnValue("https://www.google.com/");
  window.history.replaceState(null, "", "/dominican-republic/la-ex-tours?utm_source=chatgpt.com");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("does not count a page that merely loaded and ran its scripts", async () => {
  await render();
  expect(beacons()).toHaveLength(0);
});

it("counts once when a visitor on a visible tab moves, taps, scrolls or types", async () => {
  await render();
  input("pointermove"); input("wheel"); input("keydown");
  expect(beacons()).toHaveLength(1);
  const [url, init] = beacons()[0];
  expect(url).toBe("/api/listings/la-ex-tours/view");
  expect(init.method).toBe("POST"); expect(init.keepalive).toBe(true);
  expect(JSON.parse(init.body)).toEqual({ source: "google", referrerHost: "www.google.com", utmSource: "chatgpt.com" });
});

it("ignores synthetic events and scripted scrolling", async () => {
  await render();
  input("pointermove", false); input("keydown", false);
  window.dispatchEvent(new Event("scroll"));
  expect(beacons()).toHaveLength(0);
});

it("never counts an automation driver", async () => {
  webdriver = true;
  await render();
  input("pointerdown");
  expect(beacons()).toHaveLength(0);
});

it("waits for the tab to be visible", async () => {
  visibility = "hidden";
  await render();
  input("keydown");
  expect(beacons()).toHaveLength(0);
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  expect(beacons()).toHaveLength(1);
});

it("counts the next listing separately and stops listening after unmount", async () => {
  await render();
  input("touchstart");
  await render("another-tour");
  input("touchstart");
  expect(beacons().map(([url]) => url)).toEqual(["/api/listings/la-ex-tours/view", "/api/listings/another-tour/view"]);
  await act(async () => root.render(<div />));
  input("touchstart");
  expect(beacons()).toHaveLength(2);
});

it("does not depend on any consent state", async () => {
  window.localStorage.clear(); document.cookie = "cookie_consent=denied";
  await render();
  input("pointerdown");
  expect(beacons()).toHaveLength(1);
});
