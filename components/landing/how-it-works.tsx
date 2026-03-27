import { Globe, Search, TreePalm } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Globe,
    title: "Choose Your Island",
    description:
      "Pick your destination from our growing list of Caribbean islands. Each one curated by people who actually live there.",
    color: "bg-gold-500",
  },
  {
    number: "02",
    icon: Search,
    title: "Discover & Book",
    description:
      "Browse stays, tours, restaurants, events, and transport. Compare prices, read real reviews, book in seconds.",
    color: "bg-teal-500",
  },
  {
    number: "03",
    icon: TreePalm,
    title: "Enjoy Your Vakay",
    description:
      "Show up relaxed. Your whole trip is planned, booked, and confirmed. Just soak it in.",
    color: "bg-gold-500",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 md:py-32 bg-navy-700 relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center mb-20">
          <p className="text-sm font-semibold text-gold-400 uppercase tracking-widest mb-4">
            Simple as 1-2-3
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-white tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Plan your perfect trip
            <br />
            <span className="text-gold-400">in minutes</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-20 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-gold-500/0 via-gold-500/40 to-gold-500/0" />

          {steps.map((step, i) => (
            <div
              key={step.number}
              className="relative group"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="bg-white/[0.05] backdrop-blur-sm rounded-3xl p-10 border border-white/10 hover:bg-white/[0.08] transition-all duration-500 hover:-translate-y-2 text-center h-full">
                {/* Step number */}
                <div className="text-6xl font-bold text-white/[0.06] absolute top-6 right-8">
                  {step.number}
                </div>

                <div
                  className={`relative z-10 w-16 h-16 ${step.color} rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg`}
                >
                  <step.icon size={30} className="text-white" />
                </div>

                <h3 className="text-xl font-bold text-white mb-4">
                  {step.title}
                </h3>
                <p className="text-white/60 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
