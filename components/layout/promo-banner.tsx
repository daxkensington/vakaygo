"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const STORAGE_KEY = "vakaygo-promo-dismissed";
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function PromoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const timestamp = parseInt(dismissed, 10);
      if (Date.now() - timestamp < DISMISS_DURATION) return;
    }
    // Small delay for slide-down animation
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }

  if (!visible) return null;

  return (
    <div className="relative z-40 bg-gradient-to-r from-gold-500 to-gold-600 animate-in slide-in-from-top duration-500">
      <div className="mx-auto max-w-7xl px-4 py-2.5 flex items-center justify-center gap-3">
        <p className="text-sm text-white text-center font-medium">
          Plan your dream Caribbean getaway with our new AI Trip Planner!{" "}
          <Link
            href="/trips"
            className="underline underline-offset-2 hover:text-white/90 transition-colors font-semibold"
          >
            Try it now &rarr;
          </Link>
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
