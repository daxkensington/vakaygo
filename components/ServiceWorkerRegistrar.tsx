"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js.
 *
 * Nothing in this app registered it before, so the PWA was inert: no install
 * prompt, no offline fallback, no push. This was true across the whole fleet.
 *
 * Bump SW_VERSION whenever sw.js changes. The versioned URL is what gets a new
 * worker past a CDN edge cache — on mohawkmedibles.ca Cloudflare served a
 * 5-day-old worker after a deploy, so every visitor ran stale code and none of
 * that deploy's fixes took effect.
 */
const SW_VERSION = "1";

export default function ServiceWorkerRegistrar() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker
            .register(`/sw.js?v=${SW_VERSION}`, { scope: "/", updateViaCache: "none" })
            .catch((err) => {
                if (process.env.NODE_ENV === "development") {
                    console.warn("[SW] Registration failed:", err.message);
                }
            });
    }, []);

    return null;
}
