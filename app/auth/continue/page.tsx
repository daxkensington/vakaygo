"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export default function ContinuePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={32} className="animate-spin text-gold-700" />
        </div>
      }
    >
      <ContinueContent />
    </Suspense>
  );
}

function ContinueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const token = searchParams.get("token") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresPassword) {
          router.push("/auth/signin?error=use_password");
          return;
        }
        setError(data.error || "This sign-in link is invalid or has expired.");
        return;
      }
      await refresh();
      router.push(data.redirect || "/explore");
    } catch {
      setError("Something went wrong. Please try again.");
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
          <h1
            className="text-2xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sign in to VakayGo
          </h1>
          <p className="text-navy-400 mt-2 mb-6">
            Click below to finish signing in to your account.
          </p>

          {error ? (
            <>
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
                {error}
              </div>
              <Link
                href="/auth/signin"
                className="text-gold-700 font-semibold hover:text-gold-600"
              >
                Request a new sign-in link
              </Link>
            </>
          ) : (
            <button
              onClick={handleContinue}
              disabled={loading || !token}
              className="w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Continue to my account"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
