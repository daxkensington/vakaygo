"use client";

import type { MouseEvent } from "react";

export function SkipToContent() {
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const wrapper = document.getElementById("main-content");
    const target = wrapper?.querySelector<HTMLElement>("main") || wrapper?.querySelector<HTMLElement>("h1") || wrapper;
    if (!target) return;
    event.preventDefault();
    // Page landmarks need programmatic focus without adding another Tab stop.
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: "instant" });
  }

  return <a href="#main-content" onClick={skip} className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-gold-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:font-semibold">
    Skip to content
  </a>;
}
