"use client";

import { useEffect } from "react";
import { locales, rtlLocales, type Locale } from "@/i18n/config";

/**
 * Sets <html lang/dir> from the `locale` cookie (or the browser language)
 * AFTER hydration.
 *
 * This used to happen on the server via next-intl's getLocale(), which
 * reads cookies() + headers() — and that single call made EVERY page in
 * the app dynamic (Cache-Control: no-store, X-Vercel-Cache: MISS, 0.9–1.7s
 * TTFB for a page that renders in 20ms). No component consumes the
 * translated messages, so the only thing the server was buying with that
 * was the lang attribute. The server now renders lang="en" and this fixes
 * it up client-side, which lets listing/hub/home pages be cached at the
 * CDN.
 */
export function LocaleHtmlAttrs() {
  useEffect(() => {
    try {
      const fromCookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("locale="))
        ?.split("=")[1];
      const fromBrowser = (navigator.language || "").slice(0, 2).toLowerCase();
      const pick = [fromCookie, fromBrowser].find((l): l is Locale => !!l && (locales as readonly string[]).includes(l));
      if (!pick || pick === "en") return;
      const html = document.documentElement;
      html.lang = pick;
      const dir = rtlLocales.includes(pick) ? "rtl" : "ltr";
      html.dir = dir;
      html.dataset.dir = dir;
    } catch {
      /* leave the server defaults */
    }
  }, []);
  return null;
}
