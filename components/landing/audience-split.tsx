import { Check, ArrowRight } from "lucide-react";

const travelerBenefits = [
  "Discover authentic experiences you won't find on Expedia",
  "Book stays, tours, dining, and transport in one place",
  "AI trip planner builds your perfect itinerary",
  "Real reviews from real travelers",
  "Secure payments with instant confirmation",
];

const businessBenefits = [
  "Reach travelers worldwide — not just walk-ins",
  "Lower commissions than Viator and GetYourGuide",
  "Manage listings, bookings, and calendar in one dashboard",
  "Reliable weekly or monthly payouts",
  "Free analytics and growth tools",
];

export function AudienceSplit() {
  return (
    <section id="for-businesses" className="py-24 md:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
            Built for Everyone
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Two sides. One platform.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* For Travelers */}
          <div className="relative rounded-3xl overflow-hidden group">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&q=80&auto=format)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-teal-600/90 to-teal-800/95" />
            <div className="relative p-10 md:p-14">
              <span className="text-sm font-bold text-teal-200 tracking-wider uppercase">
                For Travelers
              </span>
              <h3
                className="text-3xl md:text-4xl font-bold text-white mt-4 mb-8 leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Your whole trip,
                <br />
                sorted.
              </h3>
              <ul className="space-y-4">
                {travelerBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={12} className="text-white" />
                    </div>
                    <span className="text-white/90 leading-relaxed">
                      {benefit}
                    </span>
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                className="inline-flex items-center gap-2 mt-10 bg-white text-teal-700 px-8 py-3.5 rounded-full font-semibold hover:bg-cream-100 transition-colors group"
              >
                Join as a Traveler
                <ArrowRight
                  size={16}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </a>
            </div>
          </div>

          {/* For Businesses */}
          <div className="relative rounded-3xl overflow-hidden group">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=800&q=80&auto=format)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-navy-700/90 to-navy-900/95" />
            <div className="relative p-10 md:p-14">
              <span className="text-sm font-bold text-gold-400 tracking-wider uppercase">
                For Local Businesses
              </span>
              <h3
                className="text-3xl md:text-4xl font-bold text-white mt-4 mb-8 leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Your business,
                <br />
                amplified.
              </h3>
              <ul className="space-y-4">
                {businessBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-gold-500/30 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={12} className="text-gold-400" />
                    </div>
                    <span className="text-white/90 leading-relaxed">
                      {benefit}
                    </span>
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                className="inline-flex items-center gap-2 mt-10 bg-gold-500 text-white px-8 py-3.5 rounded-full font-semibold hover:bg-gold-600 transition-colors group"
              >
                List Your Business
                <ArrowRight
                  size={16}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
