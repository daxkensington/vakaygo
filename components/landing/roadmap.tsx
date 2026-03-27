const islands = [
  {
    name: "Grenada",
    flag: "🇬🇩",
    status: "Launching 2026",
    active: true,
  },
  {
    name: "Trinidad & Tobago",
    flag: "🇹🇹",
    status: "Coming next",
    active: false,
  },
  {
    name: "Barbados",
    flag: "🇧🇧",
    status: "On the roadmap",
    active: false,
  },
  {
    name: "St. Lucia",
    flag: "🇱🇨",
    status: "On the roadmap",
    active: false,
  },
  {
    name: "St. Vincent",
    flag: "🇻🇨",
    status: "On the roadmap",
    active: false,
  },
  {
    name: "Your Island",
    flag: "🌴",
    status: "Request it",
    active: false,
  },
];

export function Roadmap() {
  return (
    <section className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Starting in Grenada.{" "}
            <span className="text-teal-500">Growing everywhere.</span>
          </h2>
          <p className="mt-4 text-navy-400 max-w-xl mx-auto">
            We&apos;re launching with the Isle of Spice, then expanding across
            the Caribbean and beyond.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {islands.map((island) => (
            <div
              key={island.name}
              className={`rounded-2xl p-6 text-center transition-all duration-300 ${
                island.active
                  ? "bg-gold-500 text-white shadow-[var(--shadow-elevated)] scale-105"
                  : "bg-cream-50 text-navy-600 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1"
              }`}
            >
              <span className="text-3xl">{island.flag}</span>
              <h4 className="font-bold mt-3 text-sm">{island.name}</h4>
              <span
                className={`text-xs mt-2 inline-block ${
                  island.active ? "text-gold-100" : "text-navy-400"
                }`}
              >
                {island.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
