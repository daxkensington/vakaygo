"use client";

import { useState } from "react";
import { X, Check, Loader2, AlertTriangle } from "lucide-react";

const REASONS = [
  { value: "no_show", label: "No Show" },
  { value: "poor_quality", label: "Poor Quality" },
  { value: "wrong_listing", label: "Wrong Listing" },
  { value: "overcharged", label: "Overcharged" },
  { value: "safety_concern", label: "Safety Concern" },
  { value: "other", label: "Other" },
];

type DisputeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  bookingNumber: string;
  listingTitle: string;
  onSubmitted?: () => void;
};

export function DisputeModal({
  isOpen,
  onClose,
  bookingId,
  bookingNumber,
  listingTitle,
  onSubmitted,
}: DisputeModalProps) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const isValid = reason && description.trim().length >= 20;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          reason,
          description: description.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit dispute");
      }

      setSuccess(true);
      onSubmitted?.();

      setTimeout(() => {
        handleClose();
      }, 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setReason("");
    setDescription("");
    setSubmitting(false);
    setSuccess(false);
    setError("");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-auto relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-navy-400 hover:text-navy-600 transition-colors"
        >
          <X size={20} />
        </button>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-600" />
            </div>
            <h3
              className="text-xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Dispute Filed
            </h3>
            <p className="text-navy-400 mt-2">
              We&apos;ve received your report and will review it shortly. You&apos;ll be
              notified once a resolution is reached.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-1 pr-8">
              <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <h3
                className="text-xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Report an Issue
              </h3>
            </div>
            <p className="text-sm text-navy-400 mb-6 ml-[52px]">
              {listingTitle} &middot; #{bookingNumber}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Reason */}
              <div>
                <label
                  htmlFor="dispute-reason"
                  className="text-sm font-medium text-navy-600 mb-2 block"
                >
                  What went wrong?
                </label>
                <select
                  id="dispute-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-cream-200 rounded-xl px-4 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-shadow bg-white"
                >
                  <option value="">Select a reason</option>
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="dispute-description"
                  className="text-sm font-medium text-navy-600 mb-2 block"
                >
                  Describe the issue
                </label>
                <textarea
                  id="dispute-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please provide details about what happened (min 20 characters)"
                  rows={5}
                  className="w-full border border-cream-200 rounded-xl px-4 py-2.5 text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-shadow resize-none"
                />
                {description.length > 0 && description.trim().length < 20 && (
                  <p className="text-xs text-red-500 mt-1">
                    Please write at least 20 characters
                  </p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!isValid || submitting}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-cream-200 disabled:text-navy-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Dispute"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
