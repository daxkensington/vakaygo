"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Flag, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useFocusTrap } from "@/components/ui/focus-trap";

type ReportReason = "inappropriate" | "misleading" | "spam" | "safety" | "other";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "misleading", label: "Misleading information" },
  { value: "spam", label: "Spam or scam" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Other" },
];

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "listing" | "user" | "review";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("inappropriate");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const titleId = useId();
  const reasonId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useFocusTrap(panelRef, open);

  // Move focus into the dialog on open and back to the trigger on close.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      (reasonRef.current ?? closeRef.current ?? panelRef.current)?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  // Keep focus inside the dialog when the focused control is disabled or
  // swapped out (submitting, failed submit, success message).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const active = document.activeElement;
    const focusInside =
      active instanceof HTMLElement &&
      active !== panel &&
      panel.contains(active) &&
      !active.matches(":disabled");
    if (focusInside) return;
    if (loading) {
      if (active !== panel) panel.focus();
      return;
    }
    const closeButton = closeRef.current;
    const target =
      (!success ? reasonRef.current : null) ??
      (closeButton && !closeButton.disabled ? closeButton : null) ??
      panel;
    target.focus();
  }, [open, loading, success]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, loading]);

  function close() {
    if (loading) return;
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit report");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setDescription("");
        setReason("inappropriate");
      }, 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-navy-400 hover:text-red-500 transition-colors"
      >
        <Flag size={12} aria-hidden="true" />
        Report
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            aria-hidden="true"
            onClick={close}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)] w-full max-w-md outline-none"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 id={titleId} className="text-lg font-bold text-navy-700">Report Content</h3>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close report dialog"
                onClick={close}
                disabled={loading}
                className="text-navy-400 hover:text-navy-600 transition-colors"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {success ? (
              <div role="status" className="flex flex-col items-center py-6">
                <CheckCircle className="w-12 h-12 text-green-500 mb-3" aria-hidden="true" />
                <p className="text-navy-700 font-semibold">Report submitted</p>
                <p className="text-sm text-navy-400 mt-1">Thank you. We will review this shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor={reasonId} className="block text-sm font-medium text-navy-600 mb-1.5">
                    Reason
                  </label>
                  <select
                    id={reasonId}
                    ref={reasonRef}
                    value={reason}
                    onChange={(e) => setReason(e.target.value as ReportReason)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 appearance-none"
                  >
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={descriptionId} className="block text-sm font-medium text-navy-600 mb-1.5">
                    Description
                  </label>
                  <textarea
                    id={descriptionId}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please describe the issue..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 resize-none"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                    <AlertCircle size={16} aria-hidden="true" />
                    {error}
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={close}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-navy-500 hover:bg-cream-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Flag size={16} aria-hidden="true" />
                    )}
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
