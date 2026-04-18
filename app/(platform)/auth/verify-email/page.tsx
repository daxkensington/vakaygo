"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Mail, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    setSending(true);
    setResendError(null);
    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResendError(data.error || "Failed to send");
        return;
      }
      setSent(true);
    } catch {
      setResendError("Something went wrong");
    } finally {
      setSending(false);
    }
  }

  const errorMessages: Record<string, string> = {
    missing_token: "The verification link is invalid. Please request a new one.",
    invalid_token:
      "This verification link has expired or is invalid. Please request a new one.",
    server_error: "Something went wrong. Please try again later.",
  };

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-8 text-center">
          {error ? (
            <>
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} className="text-red-500" />
              </div>
              <h1
                className="text-2xl font-bold text-navy-700 mb-3"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Verification Failed
              </h1>
              <p className="text-navy-400 mb-6">
                {errorMessages[error] || "Something went wrong."}
              </p>
              {user && !user.emailVerified && (
                <button
                  onClick={handleResend}
                  disabled={sending || sent}
                  className="inline-flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Mail size={16} />
                  )}
                  {sent ? "Email Sent!" : "Resend Verification Email"}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail size={32} className="text-teal-600" />
              </div>
              <h1
                className="text-2xl font-bold text-navy-700 mb-3"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Check Your Email
              </h1>
              <p className="text-navy-400 mb-2">
                We sent a verification link to{" "}
                {user?.email ? (
                  <strong className="text-navy-600">{user.email}</strong>
                ) : (
                  "your email"
                )}
                .
              </p>
              <p className="text-navy-300 text-sm mb-8">
                Click the link in the email to verify your account. The link
                expires in 24 hours.
              </p>

              {sent ? (
                <div className="flex items-center justify-center gap-2 text-teal-600 font-semibold mb-4">
                  <CheckCircle size={16} />
                  Verification email sent!
                </div>
              ) : resendError ? (
                <p className="text-red-500 text-sm mb-4">{resendError}</p>
              ) : null}

              <button
                onClick={handleResend}
                disabled={sending || sent}
                className="inline-flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Mail size={16} />
                )}
                {sent ? "Email Sent!" : "Resend Verification Email"}
              </button>

              <p className="text-navy-300 text-xs mt-6">
                Didn&apos;t receive the email? Check your spam folder or{" "}
                <Link
                  href="/contact"
                  className="text-gold-600 hover:text-gold-700 underline"
                >
                  contact support
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
