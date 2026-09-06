"use client";

import { useState, Suspense, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  const { user, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || confirming) return;
    if (password && (password.length < 12 || password.length > 128 || new TextEncoder().encode(password).length > 72)) {
      setConfirmationError("Use at least 12 characters and no more than 72 bytes for your new password.");
      return;
    }
    setConfirming(true);
    setConfirmationError(null);
    try {
      const res = await fetch("/api/auth/verify-email/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...(password ? { password } : {}) }),
      });
      const data = await res.json();
      if (!res.ok || data.ok !== true) {
        setConfirmationError(data.error || "We could not confirm this email. Please request a new link.");
        setRequiresLogin(data.requiresPassword === true);
        return;
      }
      setPassword("");
      await refresh();
      router.replace(data.redirect === "/operator" ? "/operator" : "/explore");
    } catch {
      setConfirmationError("We could not confirm this email. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

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
          {token ? (
            <>
              <Mail size={40} className="text-teal-600 mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-navy-700 mb-3">Confirm your email</h1>
              <p className="text-navy-500 mb-6">
                Select Confirm email to prove that you control this inbox and continue to your account.
              </p>
              <form onSubmit={handleConfirm} className="text-left space-y-4">
                <label className="block text-sm font-semibold text-navy-700">
                  New password (optional)
                  <input type="password" autoComplete="new-password" minLength={12} maxLength={128}
                    value={password} onChange={event => setPassword(event.target.value)}
                    disabled={confirming || requiresLogin}
                    className="mt-2 w-full rounded-xl border border-cream-300 px-4 py-3 font-normal" />
                </label>
                <p className="text-sm text-navy-500">
                  Use at least 12 characters, up to 72 bytes, if you want to sign in with a password. Accented characters
                  and emoji may use more than one byte. For an account verified for the first time,
                  any password or two-factor setup made before inbox verification is removed.
                </p>
                {confirmationError && <p role="alert" className="text-sm text-red-600">{confirmationError}</p>}
                {requiresLogin ? (
                  <Link href="/auth/signin" className="inline-block text-gold-700 underline">Continue to secure sign in</Link>
                ) : (
                  <button type="submit" disabled={confirming}
                    className="w-full inline-flex items-center justify-center gap-2 bg-gold-700 hover:bg-gold-800 text-white font-semibold px-6 py-3 rounded-xl disabled:opacity-50">
                    {confirming && <Loader2 size={16} className="animate-spin" />}
                    {confirming ? "Confirming…" : "Confirm email"}
                  </button>
                )}
              </form>
            </>
          ) : error ? (
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
              {!user && <Link href="/auth/signin?method=email" className="inline-block font-semibold text-gold-700 underline">Request an email sign-in link</Link>}
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

              {user && !user.emailVerified ? <button
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
              </button> : <>
                <p className="mb-4 text-sm text-navy-500">If your verification email is missing or expired, request an email sign-in link to verify your inbox. You do not need to be signed in.</p>
                <Link href="/auth/signin?method=email" className="inline-block font-semibold text-gold-700 underline">Request an email sign-in link</Link>
              </>}

              <p className="text-navy-300 text-xs mt-6">
                Didn&apos;t receive the email? Check your spam folder or{" "}
                <Link
                  href="/contact"
                  className="text-gold-700 hover:text-gold-700 underline"
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
