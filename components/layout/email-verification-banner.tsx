"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Mail, X, Loader2 } from "lucide-react";
import Link from "next/link";

export function EmailVerificationBanner() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Don't show if loading, no user, already verified, or dismissed
  if (loading || !user || user.emailVerified || dismissed) return null;

  async function handleResend() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST" });
      if (res.ok) setSent(true);
    } catch {
      // silent fail
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative z-[59] bg-gradient-to-r from-teal-600 to-teal-700">
      <div className="mx-auto max-w-7xl px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap">
        <Mail size={14} className="text-white/80 shrink-0" />
        <p className="text-sm text-white text-center font-medium">
          Please verify your email to unlock all features.{" "}
          {sent ? (
            <span className="font-semibold">Verification email sent!</span>
          ) : (
            <button
              onClick={handleResend}
              disabled={sending}
              className="underline underline-offset-2 hover:text-white/90 transition-colors font-semibold inline-flex items-center gap-1"
            >
              {sending && <Loader2 size={12} className="animate-spin" />}
              {sending ? "Sending..." : "Resend verification email"}
            </button>
          )}
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss verification banner"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
