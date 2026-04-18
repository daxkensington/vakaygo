import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Check, ArrowRight, X, UtensilsCrossed, Star, Users, BarChart3 } from "lucide-react";
import { DINING_TIERS } from "@/lib/pricing";

export default function ForRestaurantsPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url(https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80&auto=format)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-navy-900/85 to-navy-900/95" />
          <div className="relative mx-auto max-w-5xl px-6 text-center">
            <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-5 py-2 text-sm font-medium mb-8">
              <UtensilsCrossed size={14} />
              For Restaurants
            </div>
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Stop paying
              <br />
              <span className="text-gold-400">per person.</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto">
              OpenTable charges $149/month PLUS $1.50 every time a diner sits down.
              VakayGo charges $39/month. No cover fees. No surprises. Just travelers
              finding your restaurant.
            </p>
          </div>
        </section>

        {/* The Problem */}
        <section className="py-20 bg-cream-50">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
                What you&apos;re paying now
              </h2>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
              <p className="text-navy-600 text-center mb-8">
                A restaurant seating <span className="font-bold text-navy-700">200 covers per month</span> from OpenTable:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-6 bg-red-50 rounded-xl">
                  <p className="text-3xl font-bold text-red-600">$449</p>
                  <p className="text-sm text-red-500 mt-1">Monthly subscription (Pro)</p>
                </div>
                <div className="text-center p-6 bg-red-50 rounded-xl">
                  <p className="text-3xl font-bold text-red-600">$300</p>
                  <p className="text-sm text-red-500 mt-1">200 covers × $1.50 each</p>
                </div>
                <div className="text-center p-6 bg-red-50 rounded-xl">
                  <p className="text-3xl font-bold text-red-600">$749/mo</p>
                  <p className="text-sm text-red-500 mt-1">Total OpenTable cost</p>
                </div>
              </div>
              <div className="mt-8 text-center">
                <p className="text-navy-400">That&apos;s <span className="font-bold text-navy-700">$8,988 per year</span> just for a reservation system.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Tiers */}
        <section className="py-20 bg-white">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
                VakayGo for Restaurants
              </h2>
              <p className="mt-4 text-navy-400 text-lg">
                Zero cover fees. Ever. Pick the plan that works for you.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(DINING_TIERS).map(([key, tier]) => (
                <div
                  key={key}
                  className={`rounded-2xl p-8 ${
                    key === "essential"
                      ? "bg-gold-700 text-white shadow-[0_8px_30px_rgba(200,145,46,0.3)] scale-105"
                      : "bg-cream-50 text-navy-700"
                  }`}
                >
                  {key === "essential" && (
                    <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold">{tier.label}</h3>
                  <p className={`text-sm mt-1 ${key === "essential" ? "text-white/80" : "text-navy-400"}`}>
                    {tier.description}
                  </p>
                  <div className="mt-6">
                    <span className="text-4xl font-bold">
                      {tier.price === 0 ? "Free" : `$${tier.price}`}
                    </span>
                    {tier.price > 0 && (
                      <span className={`text-sm ${key === "essential" ? "text-white/60" : "text-navy-400"}`}>/month</span>
                    )}
                  </div>
                  <ul className="mt-6 space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check size={16} className={`shrink-0 mt-0.5 ${key === "essential" ? "text-white" : "text-teal-500"}`} />
                        <span className={key === "essential" ? "text-white/90" : ""}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/auth/signup"
                    className={`block text-center mt-8 px-6 py-3 rounded-xl font-semibold transition-colors ${
                      key === "essential"
                        ? "bg-white text-gold-600 hover:bg-cream-100"
                        : "bg-gold-700 text-white hover:bg-gold-800"
                    }`}
                  >
                    {tier.price === 0 ? "List for Free" : "Get Started"}
                  </Link>
                </div>
              ))}
            </div>

            {/* No cover fees callout */}
            <div className="mt-12 bg-teal-50 rounded-2xl p-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-3">
                <X size={20} className="text-teal-600" />
                <p className="text-xl font-bold text-teal-700">Zero per-cover fees. Always.</p>
              </div>
              <p className="text-teal-600 max-w-lg mx-auto">
                Whether you seat 10 diners or 10,000 through VakayGo, you never pay per person.
                Your monthly fee is your only cost.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="py-20 bg-cream-50">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="text-2xl font-bold text-navy-700 text-center mb-8" style={{ fontFamily: "var(--font-display)" }}>
              Annual cost comparison
            </h2>
            <div className="bg-white rounded-2xl shadow-[var(--shadow-elevated)] overflow-hidden">
              <div className="grid grid-cols-4 bg-navy-700 text-white text-sm font-semibold">
                <div className="p-4">Covers/month</div>
                <div className="p-4 text-center">OpenTable</div>
                <div className="p-4 text-center">Resy</div>
                <div className="p-4 text-center bg-gold-500">VakayGo</div>
              </div>
              {[
                { covers: 100, opentable: "$2,988", resy: "$4,788", vakaygo: "$468" },
                { covers: 200, opentable: "$8,988", resy: "$4,788", vakaygo: "$468" },
                { covers: 500, opentable: "$14,988", resy: "$4,788", vakaygo: "$468" },
                { covers: 1000, opentable: "$23,988", resy: "$4,788", vakaygo: "$948" },
              ].map((row, i) => (
                <div key={row.covers} className={`grid grid-cols-4 text-sm ${i % 2 === 0 ? "bg-white" : "bg-cream-50"}`}>
                  <div className="p-4 font-medium text-navy-700">{row.covers} covers</div>
                  <div className="p-4 text-center text-red-500 font-medium">{row.opentable}</div>
                  <div className="p-4 text-center text-navy-400">{row.resy}</div>
                  <div className="p-4 text-center font-bold text-teal-600 bg-gold-50/50">{row.vakaygo}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-navy-400 text-xs mt-4">
              OpenTable: Pro plan ($449/mo) + $1.50/network cover. Resy: Platform 360 ($399/mo). VakayGo: Essential ($39/mo) or Pro ($79/mo).
            </p>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-20 bg-white">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { icon: Users, title: "Reach Travelers", description: "Tourists searching for restaurants across 21 Caribbean islands find you on VakayGo. Not just locals — travelers planning their entire trip." },
                { icon: Star, title: "Verified Reviews", description: "Only diners who actually visited can review. No fake ratings. Build authentic trust with travelers who don't know your island yet." },
                { icon: BarChart3, title: "Know Your Guests", description: "See where your diners come from, what they order, and when they visit. Use data to fill slow nights and plan specials." },
              ].map((b) => (
                <div key={b.title} className="bg-cream-50 rounded-2xl p-8">
                  <div className="w-12 h-12 bg-gold-500 rounded-2xl flex items-center justify-center mb-6">
                    <b.icon size={24} className="text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-navy-700 mb-3">{b.title}</h3>
                  <p className="text-navy-400 leading-relaxed">{b.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-gold-500 to-gold-600">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <UtensilsCrossed size={36} className="text-white/80 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
              List your restaurant today
            </h2>
            <p className="mt-4 text-white/80 max-w-xl mx-auto">
              Start for free. Upgrade when you&apos;re ready. No contracts, no cover fees, cancel anytime.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-white text-gold-600 px-8 py-4 rounded-xl font-semibold hover:bg-cream-100 transition-colors mt-8"
            >
              Get Started Free <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
