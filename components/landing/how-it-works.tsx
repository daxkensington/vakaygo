import { Globe, Search, TreePalm } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Globe,
    title: "Choose Your Island",
    description:
      "Pick your destination. Start with Grenada, with more Caribbean islands coming soon.",
  },
  {
    number: "02",
    icon: Search,
    title: "Discover & Book",
    description:
      "Browse stays, tours, restaurants, events, and transport. Book everything in seconds.",
  },
  {
    number: "03",
    icon: TreePalm,
    title: "Enjoy Your Vakay",
    description:
      "Show up and soak it in. Your whole trip is planned, booked, and ready to go.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            How it <span className="text-teal-500">works</span>
          </h2>
          <p className="mt-4 text-navy-400 max-w-xl mx-auto">
            Three steps between you and the best trip of your life.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-[2px] bg-gradient-to-r from-gold-300 via-teal-300 to-gold-300" />

          {steps.map((step) => (
            <div key={step.number} className="relative text-center">
              <div className="relative z-10 w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[var(--shadow-elevated)]">
                <step.icon size={28} className="text-white" />
              </div>
              <span className="text-sm font-bold text-gold-500 tracking-wider uppercase">
                Step {step.number}
              </span>
              <h3 className="text-xl font-bold text-navy-700 mt-2 mb-3">
                {step.title}
              </h3>
              <p className="text-navy-400 leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
