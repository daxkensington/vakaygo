"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { analytics } from "@/lib/analytics";
import { Eye, EyeOff, Loader2, Home, Compass, Gift } from "lucide-react";

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>}>
      <SignUpContent />
    </Suspense>
  );
}

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"role" | "details">("role");
  const [role, setRole] = useState<"traveler" | "operator">("traveler");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referrerName, setReferrerName] = useState("");

  // Check for referral code in URL
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setReferralCode(ref);
      // Validate referral code
      fetch(`/api/referrals/${ref}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            setReferrerName(data.referrerName);
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, role, referralCode: referralCode || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      analytics.signUp("email");

      // Auto sign in after signup
      await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      router.push(role === "operator" ? "/operator" : "/explore");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-navy-700">
            Vakay<span className="text-gold-500">Go</span>
          </Link>
          <h1
            className="text-2xl font-bold text-navy-700 mt-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {step === "role" ? "How will you use VakayGo?" : "Create your account"}
          </h1>
          <p className="text-navy-400 mt-2">
            {step === "role"
              ? "Choose your role to get started"
              : `Signing up as a ${role === "operator" ? "business operator" : "traveler"}`}
          </p>
        </div>

        {referrerName && (
          <div className="bg-teal-50 rounded-2xl p-4 mb-4 flex items-center gap-3">
            <Gift size={20} className="text-teal-600 shrink-0" />
            <p className="text-sm text-teal-700">
              <strong>{referrerName}</strong> invited you! Sign up and earn <strong>500 bonus points</strong> on your first booking.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
          {step === "role" ? (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setRole("traveler");
                  setStep("details");
                }}
                className="w-full flex items-center gap-4 p-5 rounded-xl bg-cream-50 hover:bg-teal-50 transition-colors text-left group"
              >
                <div className="w-12 h-12 bg-teal-500 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Compass size={24} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-navy-700">I&apos;m a Traveler</p>
                  <p className="text-sm text-navy-400 mt-0.5">
                    Discover and book stays, tours, dining, and more
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setRole("operator");
                  setStep("details");
                }}
                className="w-full flex items-center gap-4 p-5 rounded-xl bg-cream-50 hover:bg-gold-50 transition-colors text-left group"
              >
                <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Home size={24} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-navy-700">I&apos;m a Business</p>
                  <p className="text-sm text-navy-400 mt-0.5">
                    List your stays, tours, restaurant, or services
                  </p>
                </div>
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">
                  {error}
                </div>
              )}

              {/* Google OAuth */}
              <a
                href="/api/auth/google"
                className="w-full flex items-center justify-center gap-3 bg-white border border-cream-300 hover:bg-cream-50 text-navy-700 py-3 rounded-xl font-semibold transition-colors mb-6"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </a>

              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-cream-200" />
                <span className="text-sm text-navy-300">or continue with email</span>
                <div className="flex-1 h-px bg-cream-200" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 pr-12"
                      placeholder="Min 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-300 hover:text-navy-500"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "Create Account"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStep("role")}
                  className="w-full text-navy-400 text-sm hover:text-navy-600 transition-colors"
                >
                  ← Change role
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-navy-400 text-sm mt-6">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-gold-600 font-semibold hover:text-gold-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
