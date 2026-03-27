"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";

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
    <section id="waitlist" className="py-24 md:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900" />
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-2xl px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Sparkles size={14} />
            Limited early access
          </div>
          <h2
            className="text-4xl md:text-5xl font-bold text-white tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Be first in line
          </h2>
          <p className="mt-4 text-white/60 text-lg max-w-md mx-auto">
            Join the waitlist and help shape the future of Caribbean travel.
          </p>
        </div>

        {submitted ? (
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-12 border border-white/10 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-gold-400 to-gold-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_8px_30px_rgba(200,145,46,0.3)]">
              <Check size={36} className="text-white" />
            </div>
            <h3
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              You&apos;re on the list!
            </h3>
            <p className="mt-4 text-white/60 max-w-sm mx-auto">
              We&apos;ll notify you when VakayGo launches in Grenada. Get ready
              for the easiest trip planning experience ever.
            </p>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 md:p-10 border border-white/10">
            {/* Tab switcher */}
            <div className="flex bg-white/5 rounded-2xl p-1 mb-8 border border-white/10">
              <button
                onClick={() => setTab("traveler")}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  tab === "traveler"
                    ? "bg-white text-navy-700 shadow-md"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                I&apos;m a Traveler
              </button>
              <button
                onClick={() => setTab("operator")}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  tab === "operator"
                    ? "bg-white text-navy-700 shadow-md"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                I&apos;m a Business
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500/50 transition-all"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500/50 transition-all"
                  placeholder="you@example.com"
                />
              </div>

              {tab === "operator" && (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-5 py-3.5 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500/50 transition-all"
                    placeholder="Your business name"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 disabled:opacity-60 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 mt-6 shadow-[0_4px_20px_rgba(200,145,46,0.3)] hover:shadow-[0_8px_30px_rgba(200,145,46,0.4)]"
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

              <p className="text-center text-white/30 text-xs mt-4">
                No spam. Unsubscribe anytime. We respect your inbox.
              </p>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
