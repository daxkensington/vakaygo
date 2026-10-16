import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import Link from "next/link";
import { Globe, Heart, Shield, Users, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "About VakayGo",
  description:
    "Caribbean-born local travel discovery. Explore businesses and plan trips across 34 Caribbean, Latin American, and Mediterranean destinations.",
  alternates: { canonical: "https://vakaygo.com/about" },
};

export default function AboutPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-700 to-navy-900" />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Built by the Caribbean.
              <br />
              <span className="text-gold-400">For the world.</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
              VakayGo is a Caribbean-born travel platform on a mission to connect
              travelers with authentic local experiences while giving businesses
              the tools and visibility they deserve.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="py-20 bg-cream-50">
          <div className="mx-auto max-w-4xl px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
                  Our Mission
                </p>
                <h2
                  className="text-3xl font-bold text-navy-700 leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Travel should be fair.
                  <br />
                  For everyone.
                </h2>
                <p className="mt-6 text-navy-500 leading-relaxed">
                  Local businesses deserve to be easy to discover. VakayGo helps
                  travelers explore places, save favorites, and plan trips, while
                  owners can claim and manage their directory profiles for free.
                  Online bookings and payments are not available yet.
                </p>
                <p className="mt-4 text-navy-500 leading-relaxed">
                  We started in Grenada because we know the Caribbean. Today
                  we&apos;re live across 34 destinations in the Caribbean, Latin
                  America, and the Mediterranean because every coastal community
                  deserves a platform that works for them.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Globe, label: "34 Hubs", sublabel: "Caribbean, LatAm & Med" },
                  { icon: Users, label: "8,038+", sublabel: "Local businesses" },
                  { icon: Heart, label: "Free", sublabel: "Travel discovery" },
                  { icon: Shield, label: "Owner", sublabel: "Claim verification" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] text-center">
                    <stat.icon size={24} className="text-gold-700 mx-auto mb-3" />
                    <p className="text-2xl font-bold text-navy-700">{stat.label}</p>
                    <p className="text-xs text-navy-400 mt-1">{stat.sublabel}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-20 bg-white">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-16">
              <h2
                className="text-3xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                What we believe
              </h2>
            </div>
            <div className="space-y-8">
              {[
                {
                  title: "Local businesses deserve visibility",
                  description:
                    "Free directory profiles help local businesses tell their story. Owners can verify a claim, keep their information current, and manage available traveler inquiries.",
                },
                {
                  title: "Travelers deserve authentic experiences",
                  description:
                    "Discover local places across the Caribbean and beyond. Directory information can come from public sources; check ownership labels and confirm details with the business before traveling.",
                },
                {
                  title: "Technology should be accessible",
                  description:
                    "Every business can list for free. No subscription, no setup fee, no tech skills needed. If you have a phone, you can run your business on VakayGo.",
                },
                {
                  title: "Transparency builds trust",
                  description:
                    "We distinguish directory listings from verified ownership and make current booking availability clear. Interest and messages do not create a reservation or authorize a payment.",
                },
              ].map((value) => (
                <div
                  key={value.title}
                  className="flex gap-6 items-start p-6 rounded-2xl bg-cream-50"
                >
                  <div className="w-2 h-2 bg-gold-500 rounded-full mt-2.5 shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-navy-700">
                      {value.title}
                    </h3>
                    <p className="text-navy-500 mt-2 leading-relaxed">
                      {value.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-gold-500 to-gold-600">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Join the movement
            </h2>
            <p className="mt-4 text-white/80 max-w-xl mx-auto">
              Whether you&apos;re a traveler looking for real experiences or a
              business ready to reach the world — VakayGo is your platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link
                href="/explore"
                className="bg-white text-gold-700 px-8 py-3.5 rounded-xl font-semibold hover:bg-cream-100 transition-colors flex items-center justify-center gap-2"
              >
                Explore Experiences <ArrowRight size={16} />
              </Link>
              <Link
                href="/for-businesses"
                className="bg-white/20 text-white border border-white/30 px-8 py-3.5 rounded-xl font-semibold hover:bg-white/30 transition-colors"
              >
                List Your Business
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
