import { Check } from "lucide-react";

const travelerBenefits = [
  "Discover authentic local experiences you won't find on Expedia",
  "Book stays, tours, dining, and transport in one place",
  "AI-powered trip planner builds your perfect itinerary",
  "Real reviews from real travelers — no fake ratings",
  "Secure payments with instant booking confirmation",
];

const businessBenefits = [
  "Reach travelers worldwide — not just walk-ins",
  "Lower commissions than Viator and GetYourGuide",
  "Manage your listings, bookings, and calendar in one dashboard",
  "Get paid reliably — weekly or monthly payouts",
  "Free tools to grow your business — analytics, reviews, and more",
];

export function AudienceSplit() {
  return (
    <section id="for-businesses" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-3xl overflow-hidden shadow-[var(--shadow-elevated)]">
          {/* For Travelers */}
          <div className="bg-cream-50 p-10 md:p-14">
            <span className="text-sm font-bold text-teal-500 tracking-wider uppercase">
              For Travelers
            </span>
            <h3
              className="text-2xl md:text-3xl font-bold text-navy-700 mt-3 mb-6"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Your whole trip,
              <br />
              sorted.
            </h3>
            <ul className="space-y-4">
              {travelerBenefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={12} className="text-white" />
                  </div>
                  <span className="text-navy-600 leading-relaxed">{benefit}</span>
                </li>
              ))}
            </ul>
            <a
              href="#waitlist"
              className="inline-block mt-8 bg-teal-500 hover:bg-teal-600 text-white px-8 py-3 rounded-full font-semibold transition-colors"
            >
              Join as a Traveler
            </a>
          </div>

          {/* For Businesses */}
          <div className="bg-navy-700 p-10 md:p-14">
            <span className="text-sm font-bold text-gold-400 tracking-wider uppercase">
              For Local Businesses
            </span>
            <h3
              className="text-2xl md:text-3xl font-bold text-white mt-3 mb-6"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Your business,
              <br />
              amplified.
            </h3>
            <ul className="space-y-4">
              {businessBenefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-gold-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={12} className="text-white" />
                  </div>
                  <span className="text-cream-200 leading-relaxed">{benefit}</span>
                </li>
              ))}
            </ul>
            <a
              href="#waitlist"
              className="inline-block mt-8 bg-gold-500 hover:bg-gold-600 text-white px-8 py-3 rounded-full font-semibold transition-colors"
            >
              List Your Business
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
