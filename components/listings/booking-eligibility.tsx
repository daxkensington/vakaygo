"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

/** Cached listing data is informational. Only a fresh API response enables controls. */
export function useCurrentBookingEligibility(listingId?: string) {
  const [state, setState] = useState({ listingId: "", eligible: false, reason: "checking" });
  const sequence = useRef(0);
  const invalidatePending = useCallback(() => { ++sequence.current; }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!listingId || document.visibilityState === "hidden") {
      return false;
    }
    try {
      const response = await fetch(`/api/listings/eligibility?listingId=${encodeURIComponent(listingId)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const data = await response.json();
      const eligible = response.ok && data.eligible === true;
      if (sequence.current === request) setState({ listingId, eligible, reason: typeof data.reason === "string" ? data.reason : "unavailable" });
      return sequence.current === request && eligible;
    } catch {
      if (sequence.current === request) setState({ listingId, eligible: false, reason: "unavailable" });
      return false;
    }
  }, [listingId]);

  useEffect(() => {
    const invalidate = () => {
      ++sequence.current;
      setState({ listingId: listingId || "", eligible: false, reason: "checking" });
      void refresh();
    };
    const rejected = (event: Event) => {
      if ((event as CustomEvent<{ listingId: string }>).detail?.listingId !== listingId) return;
      invalidatePending();
      setState({ listingId: listingId || "", eligible: false, reason: "unavailable" });
    };
    void Promise.resolve().then(refresh);
    window.addEventListener("vakaygo:booking-unavailable", rejected);
    window.addEventListener("focus", invalidate);
    window.addEventListener("pageshow", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      invalidatePending();
      window.removeEventListener("vakaygo:booking-unavailable", rejected);
      window.clearInterval(interval);
      window.removeEventListener("focus", invalidate);
      window.removeEventListener("pageshow", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [listingId, refresh, invalidatePending]);

  return { eligible: state.listingId === listingId && state.eligible === true, reason: state.reason, refresh };
}

export function invalidateBookingControls(listingId: string) {
  window.dispatchEvent(new CustomEvent("vakaygo:booking-unavailable", { detail: { listingId } }));
}

export function BookingUnavailableNotice({ listingId, operatorId, unclaimed = false }: {
  listingId: string; operatorId?: string; unclaimed?: boolean;
}) {
  const { user } = useAuth();
  const owner = Boolean(operatorId && user?.id === operatorId);
  return (
    <aside className="rounded-2xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)]" aria-label="Booking availability">
      <h2 className="text-lg font-bold text-navy-700">Information only</h2>
      <p className="mt-2 text-sm leading-relaxed text-navy-500">Online bookings, reservation requests and payments are currently unavailable for this listing.</p>
      {unclaimed ? (
        <>
          <p className="mt-3 text-sm text-navy-500">This business has not claimed its listing. Company verification and onboarding must be completed before bookings can be offered.</p>
          <Link href={user ? `/operator/claim/${listingId}` : `/auth/signup?role=operator&claim=${listingId}`} className="mt-4 inline-flex font-semibold text-gold-700 hover:underline">Own this business? Claim listing</Link>
        </>
      ) : owner ? (
        <Link href={`/operator/onboarding/${listingId}`} className="mt-4 inline-flex font-semibold text-gold-700 hover:underline">Review business onboarding</Link>
      ) : null}
    </aside>
  );
}

/** Unmounts payment/form state on revocation, refresh failure or page restoration. */
export function BookingEligibilityGate({ bookingEligible, listingId, operatorId, unclaimed, children }: {
  bookingEligible?: boolean; listingId: string; operatorId?: string; unclaimed?: boolean; children: ReactNode;
}) {
  const current = useCurrentBookingEligibility(bookingEligible === true && unclaimed !== true ? listingId : undefined);
  if (bookingEligible !== true || unclaimed === true || !current.eligible) return <BookingUnavailableNotice listingId={listingId} operatorId={operatorId} unclaimed={unclaimed} />;
  return children;
}
