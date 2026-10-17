"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import { flushAnalyticsEvents } from "@/lib/analytics";

const subscribeToHost = () => () => {};
const isProductionHost = () => ["vakaygo.com", "www.vakaygo.com"].includes(window.location.hostname);
const serverSnapshot = () => false;
const analyticsReady = () => queueMicrotask(flushAnalyticsEvents);

export function GoogleAnalytics() {
  const productionHost = useSyncExternalStore(subscribeToHost, isProductionHost, serverSnapshot);
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-HFRKQCBWR5";
  if (!gaId || !productionHost) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive" onReady={analyticsReady}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', {
            page_path: window.location.pathname,
          });
        `}
      </Script>
    </>
  );
}
