import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import {
  Compass,
  Plane,
  Shield,
  Check,
  ArrowRight,
  Anchor,
  Waves,
  Mountain,
  Car,
  Star,
  Clock,
  Users,
  MapPin,
} from "lucide-react";

export default function ServicesPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-700 via-teal-800 to-navy-900" />
          <div className="relative mx-auto max-w-5xl px-6 text-center">
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Beyond booking.
              <br />
              <span className="text-gold-400">Full-service Caribbean.</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto">
              Excursions, airport transfers, and VIP services — everything you need
              for a seamless Caribbean experience, all in one platform.
            </p>
          </div>
        </section>

        {/* Excursions */}
        <section className="py-20 md:py-28 bg-cream-50">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-600 px-4 py-2 rounded-full text-sm font-semibold mb-6">
                  <Compass size={16} />
                  Excursions
                </div>
                <h2
                  className="text-3xl md:text-4xl font-bold text-navy-700 leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Adventure awaits.
                  <br />
                  <span className="text-teal-500">Book it all here.</span>
                </h2>
                <p className="mt-6 text-navy-500 leading-relaxed">
                  From catamaran cruises to waterfall hikes, island hopping to
                  underwater sculpture parks — the Caribbean&apos;s best excursions
                  are on VakayGo. Book directly with local operators who know
                  every hidden gem.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-8">
                  {[
                    { icon: Anchor, label: "Sailing & Boat Trips" },
                    { icon: Waves, label: "Snorkeling & Diving" },
                    { icon: Mountain, label: "Hiking & Waterfalls" },
                    { icon: Compass, label: "Island Hopping" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                        <item.icon size={16} className="text-teal-500" />
                      </div>
                      <span className="text-sm font-medium text-navy-600">{item.label}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/explore?type=excursion"
                  className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-8"
                >
                  Browse Excursions <ArrowRight size={16} />
                </Link>
              </div>
              <div className="relative">
                <div
                  className="rounded-3xl overflow-hidden h-[400px] bg-cover bg-center shadow-[var(--shadow-elevated)]"
                  style={{ backgroundImage: "url(/images/categories/excursion.jpg)" }}
                />
                <div
                  className="absolute -bottom-6 -left-6 w-48 h-48 rounded-2xl bg-cover bg-center shadow-lg hidden lg:block"
                  style={{ backgroundImage: "url(/images/categories/excursion-snorkel.jpg)" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Airport Transfers */}
        <section className="py-20 md:py-28 bg-white">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1 relative">
                <div
                  className="rounded-3xl overflow-hidden h-[400px] bg-cover bg-center shadow-[var(--shadow-elevated)]"
                  style={{ backgroundImage: "url(/images/categories/transfer.jpg)" }}
                />
                <div
                  className="absolute -bottom-6 -right-6 w-48 h-48 rounded-2xl bg-cover bg-center shadow-lg hidden lg:block"
                  style={{ backgroundImage: "url(/images/categories/transfer-luxury.jpg)" }}
                />
              </div>
              <div className="order-1 lg:order-2">
                <div className="inline-flex items-center gap-2 bg-navy-50 text-navy-600 px-4 py-2 rounded-full text-sm font-semibold mb-6">
                  <Plane size={16} />
                  Airport Transfers
                </div>
                <h2
                  className="text-3xl md:text-4xl font-bold text-navy-700 leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Your driver is
                  <br />
                  <span className="text-gold-500">already waiting.</span>
                </h2>
                <p className="mt-6 text-navy-500 leading-relaxed">
                  Skip the taxi hustle. Book your airport transfer before you land.
                  Your driver meets you at arrivals with a name sign, tracks your
                  flight, and takes you straight to your hotel. Fixed pricing, no
                  surprises.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    "Fixed price — no meters, no surge, no haggling",
                    "Flight tracking — driver adjusts for delays automatically",
                    "Meet & greet at arrivals with name sign",
                    "AC vehicles — sedan, SUV, minivan, or luxury",
                    "Door-to-door service to your hotel or villa",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 bg-teal-50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={12} className="text-teal-500" />
                      </div>
                      <span className="text-navy-600 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/explore?type=transfer"
                  className="inline-flex items-center gap-2 bg-navy-600 hover:bg-navy-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-8"
                >
                  Book a Transfer <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* VIP Services */}
        <section className="py-20 md:py-28 bg-navy-700">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-300 px-4 py-2 rounded-full text-sm font-semibold mb-6">
                  <Shield size={16} />
                  VIP Services
                </div>
                <h2
                  className="text-3xl md:text-4xl font-bold text-white leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Travel like
                  <br />
                  <span className="text-gold-400">a VIP.</span>
                </h2>
                <p className="mt-6 text-white/70 leading-relaxed">
                  For travelers who want the premium experience. Personal security,
                  luxury transfers, private concierge, and executive protection
                  throughout your Caribbean stay. Discreet, professional, world-class.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-8">
                  {[
                    { icon: Shield, label: "Personal Security" },
                    { icon: Car, label: "Luxury Transfers" },
                    { icon: Star, label: "VIP Concierge" },
                    { icon: Users, label: "Executive Protection" },
                    { icon: Clock, label: "24/7 Availability" },
                    { icon: MapPin, label: "Island-Wide Coverage" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                        <item.icon size={16} className="text-gold-400" />
                      </div>
                      <span className="text-sm font-medium text-white/80">{item.label}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/explore?type=vip"
                  className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-8"
                >
                  Explore VIP Services <ArrowRight size={16} />
                </Link>
              </div>
              <div className="relative">
                <div
                  className="rounded-3xl overflow-hidden h-[400px] bg-cover bg-center shadow-[var(--shadow-elevated)]"
                  style={{ backgroundImage: "url(/images/categories/vip.jpg)" }}
                />
                <div
                  className="absolute -bottom-6 -left-6 w-48 h-48 rounded-2xl bg-cover bg-center shadow-lg hidden lg:block"
                  style={{ backgroundImage: "url(/images/categories/vip-concierge.jpg)" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-r from-gold-500 to-gold-600">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              List your service on VakayGo
            </h2>
            <p className="mt-4 text-white/80 max-w-xl mx-auto">
              Offer excursions, transfers, or VIP services? List for free, pay just
              3-5% commission. The lowest in the industry.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-white text-gold-600 px-8 py-4 rounded-xl font-semibold hover:bg-cream-100 transition-colors mt-8"
            >
              List Your Service — Free <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
