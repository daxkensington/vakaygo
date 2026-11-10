"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { safeAuthNext } from "@/lib/auth-return";
import { signInHref } from "@/lib/claim-return";

/**
 * Landing page for the button in an onboarding reminder. Opening it does
 * nothing; pressing Continue POSTs the one-time link to /api/auth/setup-link,
 * which signs the business in and returns the setup page to open. A link that
 * is used up, expired or invalid falls back to the normal sign-in, keeping the
 * destination.
 */
export default function SetupLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={32} className="animate-spin text-gold-700" />
        </div>
      }
    >
      <SetupLinkContent />
    </Suspense>
  );
}

function SetupLinkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const token = searchParams.get("token") || "";
  const returnPath = safeAuthNext(searchParams.get("next"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);

  async function handleContinue() {
    if (loading || !token) return;
    setError("");
    setRetryable(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, next: returnPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.requiresPassword) {
          router.push(signInHref(null, { error: "use_password", next: returnPath }));
          return;
        }
        setError(typeof data.error === "string" ? data.error : "This setup link is not valid. Sign in to continue.");
        setRetryable(res.status >= 500 || res.status === 429);
        return;
      }
      if (data.ok !== true) throw new Error("Incomplete sign-in response");
      await refresh();
      router.push(safeAuthNext(data.redirect) || "/operator");
    } catch {
      setError("Something went wrong. Please try again.");
      setRetryable(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-navy-700">
            Vakay<span className="text-gold-700">Go</span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)] text-center">
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
            Continue setting up your listing
          </h1>
          <p className="text-navy-400 mt-2 mb-6">
            Press the button to sign in and go straight to your next setup step. This link works once.
          </p>

          {error || !token ? (
            <>
              <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
                {error || "This setup link is incomplete. Sign in to continue."}
              </div>
              {retryable && (
                <button type="button" onClick={handleContinue} disabled={loading} className="mb-4 w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3 rounded-xl font-semibold">
                  {loading ? "Signing in…" : "Try again"}
                </button>
              )}
              <Link href={signInHref(null, { next: returnPath })} className="text-gold-700 font-semibold hover:text-gold-600">
                Sign in to continue
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              disabled={loading}
              className="w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Continue to my setup"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
