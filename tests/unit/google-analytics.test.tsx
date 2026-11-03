import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analytics } from "@/lib/analytics";

const scripts = vi.hoisted(() => ({ rendered: [] as { id?: string; src?: string; children?: string; onReady?: () => void }[] }));
vi.mock("next/script", () => ({ default: (props: typeof scripts.rendered[number]) => {
  scripts.rendered.push(props);
  return null;
} }));
import { GoogleAnalytics } from "@/components/analytics/google-analytics";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  scripts.rendered = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  delete window.gtag;
  delete window.vakaygoPendingAnalytics;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.gtag;
  delete window.vakaygoPendingAnalytics;
});

it.each(["localhost", "127.0.0.1", "vakaygo-preview.vercel.app", "vakaygo.com.evil.invalid"])("does not send test or preview traffic from %s", async hostname => {
  vi.spyOn(window, "location", "get").mockReturnValue({ hostname } as Location);
  await act(async () => root.render(<GoogleAnalytics />));
  expect(scripts.rendered).toEqual([]);
});

it.each(["vakaygo.com", "www.vakaygo.com"])("retains one initializer and drains early events on %s", async hostname => {
  vi.spyOn(window, "location", "get").mockReturnValue({ hostname } as Location);
  analytics.listingInterestSaved("listing-1");
  await act(async () => root.render(<GoogleAnalytics />));
  const initializer = scripts.rendered.find(script => script.id === "ga4-init")!;
  expect(scripts.rendered.filter(script => script.src?.startsWith("https://www.googletagmanager.com/gtag/js?id="))).toHaveLength(1);
  expect(initializer.children?.match(/gtag\('config'/g)).toHaveLength(1);
  expect(initializer.children).not.toContain("gtag('event', 'page_view'");
  // Next calls inline onReady before appending/executing the script.
  initializer.onReady!();
  window.gtag = vi.fn();
  await Promise.resolve();
  initializer.onReady!();
  await Promise.resolve();
  expect(window.gtag).toHaveBeenCalledTimes(1);
  expect(window.gtag).toHaveBeenCalledWith("event", "listing_interest_saved", { listing_id: "listing-1" });
});
