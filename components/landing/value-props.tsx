"use client";

import { Layers, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

const props = [
  {
    icon: Layers,
    title: "Everything in One Place",
    description:
      "Stays, tours, dining, events, transport, and local guides. Stop juggling 10 apps — plan your entire trip right here.",
    gradient: "from-gold-500 to-gold-600",
    iconBg: "bg-gold-500",
    image:
      "/images/sections/value-local.jpg",
  },
  {
    icon: ShieldCheck,
    title: "Trusted Local Operators",
    description:
      "Every business is verified. Real reviews from real travelers. Secure payments with instant confirmation.",
    gradient: "from-teal-500 to-teal-600",
    iconBg: "bg-teal-500",
    image:
      "/images/sections/value-travel.jpg",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Trip Planning",
    description:
      'Tell us your vibe. "3-day romantic getaway in Grenada" — and we\'ll build a day-by-day itinerary from real local spots.',
    gradient: "from-gold-500 to-teal-500",
    iconBg: "bg-gradient-to-br from-gold-500 to-teal-500",
    image:
      "/images/sections/value-explore.jpg",
  },
];

export function ValueProps() {
  return (
    <section className="py-24 md:py-32 bg-cream-50 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-20">
          <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
            Why VakayGo
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The travel platform
            <br />
            <span className="text-teal-500">powered by the Caribbean</span>
          </h2>
        </div>

        <div className="space-y-8">
          {props.map((prop, i) => (
            <div
              key={prop.title}
              className={`group relative bg-white rounded-3xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-500 ${
                i % 2 === 1 ? "md:flex-row-reverse" : ""
              }`}
            >
              <div
                className={`flex flex-col ${
                  i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"
                }`}
              >
                {/* Image side */}
                <div className="md:w-1/2 relative overflow-hidden">
                  <div
                    className="h-64 md:h-full min-h-[320px] bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url(${prop.image})` }}
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-${
                      i % 2 === 1 ? "l" : "r"
                    } ${prop.gradient} opacity-20`}
                  />
                </div>

                {/* Text side */}
                <div className="md:w-1/2 p-10 md:p-14 flex flex-col justify-center">
                  <div
                    className={`w-14 h-14 ${prop.iconBg} rounded-2xl flex items-center justify-center mb-6 shadow-lg`}
                  >
                    <prop.icon size={28} className="text-white" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-navy-700 mb-4 leading-tight">
                    {prop.title}
                  </h3>
                  <p className="text-navy-400 leading-relaxed text-lg">
                    {prop.description}
                  </p>
                  <div className="mt-8">
                    <a
                      href="/explore"
                      className="inline-flex items-center gap-2 text-gold-700 font-semibold group-hover:gap-3 transition-all"
                    >
                      Explore now
                      <ArrowRight size={16} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
