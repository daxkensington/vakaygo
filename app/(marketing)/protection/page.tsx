import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import Link from "next/link";
import {
  Shield,
  CreditCard,
  CalendarCheck,
  Headphones,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

const pillars = [
  {
    icon: CreditCard,
    title: "Payment Protection",
    description:
      "Every transaction on VakayGo is secured with bank-grade encryption. If a booking is fraudulent or unauthorized, you are fully covered.",
    features: [
      "Secure payment processing",
      "Fraud detection & prevention",
      "Full refund on unauthorized charges",
      "Encrypted financial data",
    ],
    iconBg: "bg-gold-50",
    iconColor: "text-gold-600",
  },
  {
    icon: CalendarCheck,
    title: "Booking Guarantee",
    description:
      "If an operator cancels your booking or the experience does not match the listing, we will help you find an alternative or give you a full refund.",
    features: [
      "Free cancellation options",
      "Alternative rebooking assistance",
      "Refund if listing is inaccurate",
      "24-hour check-in support",
    ],
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
  },
  {
    icon: Headphones,
    title: "24/7 Support",
    description:
      "Our dedicated trust & safety team is available around the clock. Whether it is an emergency or a question, we are here for you.",
    features: [
      "24/7 emergency hotline",
      "In-app messaging support",
      "Multilingual assistance",
      "Local on-island contacts",
    ],
    iconBg: "bg-gold-50",
    iconColor: "text-gold-600",
  },
];

const faqs = [
  {
    q: "What does VakayGo Protection cover?",
    a: "VakayGo Protection covers payment fraud, last-minute cancellations by operators, significant listing inaccuracies, and safety issues during your trip. Coverage applies to all bookings made through the VakayGo platform.",
  },
  {
    q: "How do I file a claim?",
    a: "You can file a claim through the Help section of the app or by contacting our support team. Claims should be submitted within 72 hours of the incident for fastest resolution.",
  },
  {
    q: "Are all bookings covered?",
    a: "Yes, every booking made and paid through VakayGo is automatically covered by our Protection Guarantee at no additional cost.",
  },
  {
    q: "How long does a refund take?",
    a: "Approved refunds are processed within 3-5 business days. Emergency refunds for safety issues can be expedited within 24 hours.",
  },
  {
    q: "What is not covered?",
    a: "Protection does not cover changes of mind, weather-related disruptions (unless the operator cancels), or issues arising from guest violations of operator policies.",
  },
];

export default function ProtectionPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-700 to-navy-900" />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-500/20">
              <Shield className="h-10 w-10 text-gold-400" />
            </div>
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              VakayGo Protection
              <br />
              <span className="text-gold-400">Guarantee</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
              Travel with confidence. Every booking on VakayGo comes with built-in
              protection for your payments, reservations, and peace of mind.
            </p>
          </div>
        </section>

        {/* Three Pillars */}
        <section className="py-20 bg-cream-50">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
                How You Are Protected
              </p>
              <h2
                className="text-3xl md:text-4xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Three pillars of trust
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {pillars.map((pillar) => (
                <div
                  key={pillar.title}
                  className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${pillar.iconBg} ${pillar.iconColor} mb-6`}>
                    <pillar.icon size={28} />
                  </div>
                  <h3
                    className="text-xl font-bold text-navy-700 mb-3"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {pillar.title}
                  </h3>
                  <p className="text-navy-500 text-sm leading-relaxed mb-5">
                    {pillar.description}
                  </p>
                  <ul className="space-y-2.5">
                    {pillar.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-navy-600">
                        <CheckCircle size={16} className="text-teal-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 bg-white">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
                Common Questions
              </p>
              <h2
                className="text-3xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq) => (
                <div
                  key={faq.q}
                  className="bg-cream-50 rounded-2xl p-6 shadow-[var(--shadow-card)]"
                >
                  <h3 className="font-bold text-navy-700 mb-2">{faq.q}</h3>
                  <p className="text-sm text-navy-500 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-cream-50">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <Shield className="w-12 h-12 text-gold-500 mx-auto mb-6" />
            <h2
              className="text-3xl font-bold text-navy-700 mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ready to explore?
            </h2>
            <p className="text-navy-500 mb-8 leading-relaxed">
              Every experience on VakayGo is backed by our Protection Guarantee.
              Browse stays, tours, and restaurants with confidence.
            </p>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-8 py-4 rounded-xl font-semibold transition-colors text-lg"
            >
              Start Exploring
              <ArrowRight size={20} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
