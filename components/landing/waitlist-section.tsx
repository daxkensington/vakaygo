"use client";

import { ArrowRight, Palmtree } from "lucide-react";
import Link from "next/link";

export function WaitlistSection() {
  return (
    <section id="join" className="py-24 md:py-32 relative overflow-hidden">
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

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
          <Palmtree size={14} />
          Now live across 21 islands
        </div>
        <h2
          className="text-4xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Ready to explore the Caribbean?
        </h2>
        <p className="mt-4 text-white/60 text-lg max-w-md mx-auto">
          Sign up free and start planning your perfect island getaway.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white px-8 py-4 rounded-full font-semibold transition-all duration-300 shadow-[0_4px_20px_rgba(200,145,46,0.3)] hover:shadow-[0_8px_30px_rgba(200,145,46,0.4)]"
          >
            Sign Up Free
            <ArrowRight size={18} />
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 bg-white text-navy-700 px-8 py-4 rounded-full font-semibold hover:bg-cream-100 transition-colors"
          >
            Explore Listings
            <ArrowRight size={18} />
          </Link>
        </div>

        <p className="mt-10 text-white/40 text-sm">
          Are you a local business?{" "}
          <Link
            href="/for-businesses"
            className="text-gold-400 hover:text-gold-300 font-semibold underline underline-offset-2 transition-colors"
          >
            List your business on VakayGo
          </Link>
        </p>
      </div>
    </section>
  );
}
