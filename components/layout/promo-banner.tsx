"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

const STORAGE_KEY = "vakaygo-promo-dismissed";
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Where the trip-planner announcement stays out of the way: the landing page
 * (its hero has the same call to action), sign-in and sign-up (the visitor is
 * already on the way to an account), the planner itself, and the pages where
 * someone is mid-task: checkout, bookings and the operator/admin areas.
 */
const QUIET_PREFIXES = ["/auth", "/trips", "/operator", "/admin", "/bookings", "/checkout"];

export function promoBannerAllowed(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === "/") return false;
  return !QUIET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

/** Storage can throw (private modes, blocked site data); the banner must never take the page down. */
function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const timestamp = parseInt(raw, 10);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  } catch {
    // Dismissed for this page view only.
  }
}

export function PromoBanner() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const allowed = promoBannerAllowed(pathname);

  useEffect(() => {
    if (!allowed) return;
    const dismissedAt = readDismissedAt();
    if (dismissedAt !== null && Date.now() - dismissedAt < DISMISS_DURATION) return;
    // Small delay for slide-down animation
    requestAnimationFrame(() => setVisible(true));
  }, [allowed]);

  function dismiss() {
    setVisible(false);
    rememberDismissed();
  }

  if (!visible || !allowed) return null;

  return (
    <div role="region" aria-label="Travel planning announcement" className="relative z-[60] bg-gradient-to-r from-gold-700 to-gold-800 animate-in slide-in-from-top duration-500">
      <div className="mx-auto max-w-7xl px-10 py-2.5 flex items-center justify-center gap-3">
        <p className="text-sm text-white text-center font-medium">
          Plan a day-by-day itinerary with the AI Trip Planner. It is free with a VakayGo account.{" "}
          <Link
            href="/trips/new"
            className="underline underline-offset-2 hover:text-white/90 transition-colors font-semibold"
          >
            Start planning &rarr;
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
