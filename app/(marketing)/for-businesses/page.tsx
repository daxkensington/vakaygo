import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import {
  Check,
  ArrowRight,
  DollarSign,
  BarChart3,
  Globe,
  Shield,
  Calendar,
  Star,
  Zap,
  Users,
} from "lucide-react";

const benefits = [
  {
    icon: DollarSign,
    title: "List for Free. Forever.",
    description:
      "No listing fees. No monthly subscription. No setup costs. Create your listing in minutes and start reaching travelers today.",
  },
  {
    icon: BarChart3,
    title: "3% Commission — The Lowest Around",
    description:
      "Viator takes 25%. Airbnb takes 15%. We take just 3%. You keep more of every booking. Period.",
  },
  {
    icon: Globe,
    title: "Reach Travelers Worldwide",
    description:
      "Stop relying on walk-ins and word of mouth. VakayGo puts your business in front of travelers planning their Caribbean trip.",
  },
  {
    icon: Calendar,
    title: "All-in-One Dashboard",
    description:
      "Manage bookings, calendar, availability, pricing, and reviews from one simple dashboard. No tech skills needed.",
  },
  {
    icon: Shield,
    title: "Secure Payments, Reliable Payouts",
    description:
      "We handle all payments securely. You get paid weekly — directly to your bank account. No chasing invoices.",
  },
  {
    icon: Star,
    title: "Build Your Reputation",
    description:
      "Collect verified reviews from real customers. Build a trusted profile that attracts more bookings over time.",
  },
];

const comparisons = [
  { feature: "Listing Fee", vakaygo: "Free", viator: "Free", airbnb: "Free" },
  { feature: "Commission", vakaygo: "3%", viator: "20-30%", airbnb: "15%" },
  { feature: "Payout Speed", vakaygo: "Weekly", viator: "Monthly", airbnb: "24h after check-in" },
  { feature: "Dashboard", vakaygo: "Full suite", viator: "Basic", airbnb: "Full suite" },
  { feature: "Multiple Verticals", vakaygo: "6 types", viator: "Tours only", airbnb: "Stays only" },
  { feature: "Local Focus", vakaygo: "Caribbean-first", viator: "Global", airbnb: "Global" },
  { feature: "Transparent Pricing", vakaygo: "Yes", viator: "No", airbnb: "No" },
];

const steps = [
  {
    number: "1",
    title: "Sign up as an operator",
    description: "Create your free account in 30 seconds. No credit card required.",
  },
  {
    number: "2",
    title: "Create your listing",
    description: "Add photos, description, pricing, and availability. Our wizard makes it easy.",
  },
  {
    number: "3",
    title: "Start receiving bookings",
    description: "Travelers discover your listing, book directly, and you get paid weekly.",
  },
];

const testimonials = [
  {
    name: "Captain Marcus",
    role: "Sailing Tour Operator",
    location: "St. George's, Grenada",
    quote: "Finally a platform that doesn't take half my earnings. VakayGo gets it — support local businesses, not corporate middlemen.",
  },
  {
    name: "Keisha Williams",
    role: "Nature Guide",
    location: "Grand Etang, Grenada",
    quote: "I used to rely on hotel referrals. Now travelers find me directly on VakayGo. My bookings have tripled.",
  },
  {
    name: "The Beach House",
    role: "Restaurant",
    location: "Grand Anse, Grenada",
    quote: "The reservation system is simple and our guests love the verified review system. No more fake ratings.",
  },
];

export default function ForBusinessesPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 md:pb-28 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900" />
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "40px 40px",
              }}
            />
          </div>
          <div className="relative mx-auto max-w-5xl px-6 text-center">
            <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-5 py-2 text-sm font-medium mb-8">
              <Zap size={14} />
              Free to list — always
            </div>
            <h1
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Grow your business.
              <br />
              <span className="text-gold-400">Keep your money.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
              List your stays, tours, restaurant, events, or services on VakayGo for free. We take just 3% — the lowest commission in the travel industry.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
              <Link
                href="/auth/signup"
                className="bg-gold-500 hover:bg-gold-600 text-white px-8 py-4 rounded-xl font-semibold transition-all hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2"
              >
                List Your Business Free
                <ArrowRight size={18} />
              </Link>
              <a
                href="#how-it-works"
                className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-xl font-semibold transition-colors border border-white/20"
              >
                See How It Works
              </a>
            </div>
          </div>
        </section>

        {/* Commission Comparison */}
        <section className="py-20 md:py-28 bg-cream-50">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl md:text-4xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Compare and see the <span className="text-gold-500">difference</span>
              </h2>
            </div>
            <div className="bg-white rounded-2xl shadow-[var(--shadow-elevated)] overflow-hidden">
              <div className="grid grid-cols-4 bg-navy-700 text-white text-sm font-semibold">
                <div className="p-4">Feature</div>
                <div className="p-4 text-center bg-gold-500">VakayGo</div>
                <div className="p-4 text-center">Viator</div>
                <div className="p-4 text-center">Airbnb</div>
              </div>
              {comparisons.map((row, i) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-4 text-sm ${i % 2 === 0 ? "bg-white" : "bg-cream-50"}`}
                >
                  <div className="p-4 font-medium text-navy-700">{row.feature}</div>
                  <div className="p-4 text-center font-semibold text-gold-600 bg-gold-50/50">
                    {row.vakaygo}
                  </div>
                  <div className="p-4 text-center text-navy-400">{row.viator}</div>
                  <div className="p-4 text-center text-navy-400">{row.airbnb}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-20 md:py-28 bg-white">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center mb-16">
              <h2
                className="text-3xl md:text-4xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Why operators choose <span className="text-teal-500">VakayGo</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {benefits.map((b) => (
                <div
                  key={b.title}
                  className="bg-cream-50 rounded-2xl p-8 hover:-translate-y-1 transition-transform duration-300"
                >
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

        {/* How It Works */}
        <section id="how-it-works" className="py-20 md:py-28 bg-navy-700">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-16">
              <h2
                className="text-3xl md:text-4xl font-bold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Start in <span className="text-gold-400">3 minutes</span>
              </h2>
            </div>
            <div className="space-y-6">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className="flex items-start gap-6 bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
                >
                  <div className="w-12 h-12 bg-gold-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{step.title}</h3>
                    <p className="text-white/60 mt-1">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-20 md:py-28 bg-cream-50">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center mb-16">
              <h2
                className="text-3xl md:text-4xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Trusted by <span className="text-gold-500">local operators</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <div
                  key={t.name}
                  className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]"
                >
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={16} className="text-gold-500 fill-gold-500" />
                    ))}
                  </div>
                  <p className="text-navy-600 leading-relaxed italic">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="mt-6 pt-4 border-t border-cream-200">
                    <p className="font-semibold text-navy-700">{t.name}</p>
                    <p className="text-sm text-navy-400">
                      {t.role} · {t.location}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28 bg-gradient-to-br from-gold-500 to-gold-600">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <Users size={40} className="text-white/80 mx-auto mb-6" />
            <h2
              className="text-3xl md:text-4xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ready to grow your business?
            </h2>
            <p className="mt-4 text-white/80 text-lg max-w-xl mx-auto">
              Join VakayGo today. Free forever. Start receiving bookings from
              travelers around the world.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-white text-gold-600 px-8 py-4 rounded-xl font-semibold hover:bg-cream-100 transition-colors mt-8"
            >
              Create Your Free Listing
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
