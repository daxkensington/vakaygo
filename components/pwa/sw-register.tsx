"use client";

import { useEffect, useState } from "react";
import { registerServiceWorker, applyServiceWorkerUpdate } from "@/lib/register-sw";

export function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    registerServiceWorker().then((reg) => {
      if (reg) setRegistration(reg);
    });

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setRegistration(detail.registration);
      setUpdateAvailable(true);
    };

    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  if (!updateAvailable || !registration) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-slate-900 border border-teal-500/30 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-4">
      <p className="text-sm text-white font-medium mb-2">
        A new version of VakayGo is available
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => applyServiceWorkerUpdate(registration)}
          className="flex-1 text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white rounded-xl px-3 py-2 transition-colors"
        >
          Update now
        </button>
        <button
          onClick={() => setUpdateAvailable(false)}
          className="text-sm text-slate-400 hover:text-white px-3 py-2 transition-colors"
        >
          Later
        </button>
      </div>
    </div>
  );
}
