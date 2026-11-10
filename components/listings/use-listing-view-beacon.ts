"use client";

import { useEffect } from "react";
import { describeView, HUMAN_INPUT_EVENTS, isHumanInput } from "@/lib/view-attribution";

/**
 * Counts one listing view per page view, and only for a person: the tab is
 * visible and the visitor moved, tapped, scrolled or typed. Crawlers that
 * run the page's JavaScript (most of what this counter used to record)
 * never do that, and automation drivers are skipped outright.
 *
 * The count does not wait for cookie consent: nothing sent here
 * identifies the visitor.
 */
export function useListingViewBeacon(slug: string | undefined, island: string | undefined) {
  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    if (navigator.webdriver) return;

    let sent = false;
    const stop = () => {
      for (const name of HUMAN_INPUT_EVENTS) window.removeEventListener(name, onInput);
      document.removeEventListener("visibilitychange", onVisible);
    };
    let interacted = false;
    const send = () => {
      if (sent || !interacted || document.visibilityState !== "visible") return;
      sent = true;
      stop();
      const landing = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
      const history = (window as unknown as { navigation?: { entries?: () => { url: string | null }[]; currentEntry?: { index: number } } }).navigation;
      let previousHref: string | null = null;
      try {
        const index = history?.currentEntry?.index;
        if (typeof index === "number" && index > 0) previousHref = history?.entries?.()[index - 1]?.url ?? null;
      } catch {
        // The Navigation API is optional.
      }
      const view = describeView({
        href: window.location.href,
        referrer: document.referrer,
        landingHref: landing?.name ?? null,
        previousHref,
        island,
      });
      fetch(`/api/listings/${slug}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(view),
        keepalive: true,
      }).catch(() => {});
    };
    function onInput(event: Event) {
      if (!isHumanInput(event)) return;
      interacted = true;
      send();
    }
    function onVisible() {
      send();
    }
    for (const name of HUMAN_INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    return stop;
  }, [slug, island]);
}
