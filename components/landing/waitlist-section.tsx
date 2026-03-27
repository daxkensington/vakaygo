"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

export function WaitlistSection() {
  const [tab, setTab] = useState<"traveler" | "operator">("traveler");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          type: tab,
          businessName: tab === "operator" ? businessName : undefined,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      }
    } catch {
      // silently fail for now
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="waitlist" className="py-20 md:py-28 bg-cream-50">
      <div className="mx-auto max-w-2xl px-6">
        <div className="text-center mb-10">
          <h2
            className="text-3xl md:text-4xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Get early <span className="text-gold-500">access</span>
          </h2>
          <p className="mt-4 text-navy-400">
            Be the first to know when VakayGo launches. Join the waitlist and
            help shape the future of Caribbean travel.
          </p>
        </div>

        {submitted ? (
          <div className="bg-white rounded-2xl p-10 shadow-[var(--shadow-elevated)] text-center">
            <div className="w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check size={32} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
              You&apos;re in!
            </h3>
            <p className="mt-3 text-navy-400">
              We&apos;ll notify you when VakayGo launches in Grenada. Check your
              inbox for a confirmation.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 md:p-10 shadow-[var(--shadow-elevated)]">
            {/* Tab switcher */}
            <div className="flex bg-cream-100 rounded-xl p-1 mb-8">
              <button
                onClick={() => setTab("traveler")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === "traveler"
                    ? "bg-white text-navy-700 shadow-sm"
                    : "text-navy-400 hover:text-navy-600"
                }`}
              >
                I&apos;m a Traveler
              </button>
              <button
                onClick={() => setTab("operator")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === "operator"
                    ? "bg-white text-navy-700 shadow-sm"
                    : "text-navy-400 hover:text-navy-600"
                }`}
              >
                I&apos;m a Business
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 transition-all"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 transition-all"
                  placeholder="you@example.com"
                />
              </div>

              {tab === "operator" && (
                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 transition-all"
                    placeholder="Your business name"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors mt-6"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    Join the Waitlist
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
