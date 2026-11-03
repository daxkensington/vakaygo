"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { CANCELLATION_POLICIES, calculateRefundPercent, cancellationPolicyKey } from "@/lib/cancellation";
import { localBookingNow } from "@/lib/booking-validation";

const CANCELLABLE_STATUSES = new Set(["requested", "pending", "confirmed"]);

export function canCancelBooking(status: string) {
  return CANCELLABLE_STATUSES.has(status);
}

export type CancellationReceipt = {
  success: true;
  status: "cancelled" | "refunded";
  refundAmount: number;
  refundPercent?: number;
  policy?: string;
  message?: string;
};

type CancelBookingControlProps = {
  bookingId: string;
  bookingNumber: string;
  status: string;
  totalAmount: string;
  currency: string | null;
  paidAt: string | null;
  startDate: string;
  cancellationPolicy?: string | null;
  listingTimezone?: string | null;
  actor: "traveler" | "business";
  className?: string;
  onComplete: (receipt: CancellationReceipt) => void;
};

function formatAmount(amount: number, currency: string | null) {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function CancelBookingControl({
  bookingId,
  bookingNumber,
  status,
  totalAmount,
  currency,
  paidAt,
  startDate,
  cancellationPolicy,
  listingTimezone,
  actor,
  className,
  onComplete,
}: CancelBookingControlProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  if (!canCancelBooking(status)) return null;

  const paid = !!paidAt;
  const policy = CANCELLATION_POLICIES[cancellationPolicyKey(cancellationPolicy)];
  const hoursUntilStart = (new Date(startDate).getTime() - localBookingNow(listingTimezone || null).getTime()) / 3_600_000;
  const refundPercent = paid ? (actor === "business" ? 100 : calculateRefundPercent(cancellationPolicy ?? null, hoursUntilStart)) : 0;
  const total = Number(totalAmount);
  const refundAmount = Number.isFinite(total) ? total * refundPercent / 100 : 0;
  const actionLabel = paid && actor === "business" ? "Cancel & refund" : "Cancel booking";

  async function confirmCancellation() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.success !== true || !["cancelled", "refunded"].includes(data.status)) {
        setError(data.error || "Cancellation could not finish. Please try again.");
        return;
      }
      const receipt = data as CancellationReceipt;
      setOpen(false);
      onComplete(receipt);
    } catch {
      setError("Cancellation could not finish. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(""); setOpen(true); }}
        className={className || "text-sm font-semibold text-red-600 hover:text-red-700"}
      >
        {actionLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 text-left">
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="shrink-0 text-red-500" size={22} />
                <h2 id={titleId} className="text-xl font-bold text-navy-700">Cancel booking #{bookingNumber}?</h2>
              </div>
              <button ref={closeRef} type="button" aria-label="Close cancellation dialog" onClick={() => setOpen(false)} disabled={busy} className="text-navy-400 hover:text-navy-700 disabled:opacity-50">
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 rounded-xl bg-cream-50 p-4 text-sm">
              <p className="font-semibold text-navy-700">{actor === "business" ? "Business cancellation" : `${policy.label} cancellation policy`}</p>
              <p className="mt-1 text-navy-500">{actor === "business" ? "Operator and admin cancellations refund the full recorded payment." : policy.summary}</p>
              <p className="mt-3 font-semibold text-navy-700">
                {paid ? `${actor === "traveler" ? "Estimated refund" : "Refund"}: ${formatAmount(refundAmount, currency)} (${refundPercent}%)` : "No payment has been made, so there is nothing to refund."}
              </p>
            </div>
            <label htmlFor={`${titleId}-reason`} className="mt-5 block text-sm font-semibold text-navy-700">Reason (optional)</label>
            <textarea
              id={`${titleId}-reason`}
              value={reason}
              onChange={event => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={busy}
              className="mt-2 w-full resize-none rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm text-navy-700 outline-none focus:border-gold-500"
            />
            {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-xl border border-cream-300 px-4 py-2.5 text-sm font-semibold text-navy-600 hover:bg-cream-50 disabled:opacity-50">
                Keep booking
              </button>
              <button type="button" onClick={confirmCancellation} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? "Cancelling…" : actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
