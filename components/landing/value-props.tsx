import { Layers, ShieldCheck, Sparkles } from "lucide-react";

const props = [
  {
    icon: Layers,
    title: "Everything in One Place",
    description:
      "Stays, tours, dining, events, transport, and local guides — stop juggling 10 apps. Plan your entire trip right here.",
  },
  {
    icon: ShieldCheck,
    title: "Book with Confidence",
    description:
      "Every operator is verified. Real reviews from real travelers. Secure payments. No surprises, just great experiences.",
  },
  {
    icon: Sparkles,
    title: "AI Trip Planner",
    description:
      "Tell us your vibe — romantic, adventurous, family-friendly — and we'll build a day-by-day itinerary from the best local spots.",
  },
];

export function ValueProps() {
  return (
    <section className="py-20 md:py-28 bg-cream-50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Travel should be{" "}
            <span className="text-gold-500">effortless</span>
          </h2>
          <p className="mt-4 text-navy-400 max-w-xl mx-auto">
            We built VakayGo because planning a Caribbean trip shouldn&apos;t
            require a PhD in Google searches.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {props.map((prop) => (
            <div
              key={prop.title}
              className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow duration-300 hover:-translate-y-1 transition-transform"
            >
              <div className="w-12 h-12 bg-gold-50 rounded-xl flex items-center justify-center mb-6">
                <prop.icon size={24} className="text-gold-500" />
              </div>
              <h3 className="text-xl font-bold text-navy-700 mb-3">
                {prop.title}
              </h3>
              <p className="text-navy-400 leading-relaxed">{prop.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
