const islands = [
  {
    name: "Grenada",
    flag: "🇬🇩",
    tagline: "Isle of Spice",
    status: "Launching 2026",
    active: true,
  },
  {
    name: "Trinidad & Tobago",
    flag: "🇹🇹",
    tagline: "Carnival Capital",
    status: "Coming next",
    active: false,
  },
  {
    name: "Barbados",
    flag: "🇧🇧",
    tagline: "Gem of the Caribbean",
    status: "On the roadmap",
    active: false,
  },
  {
    name: "St. Lucia",
    flag: "🇱🇨",
    tagline: "The Pitons Await",
    status: "On the roadmap",
    active: false,
  },
  {
    name: "St. Vincent",
    flag: "🇻🇨",
    tagline: "Grenadine Paradise",
    status: "On the roadmap",
    active: false,
  },
  {
    name: "More Islands",
    flag: "🌊",
    tagline: "Expanding globally",
    status: "Request yours",
    active: false,
  },
];

export function Roadmap() {
  return (
    <section className="py-24 md:py-32 bg-cream-50 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">
            Our Journey
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Starting local.{" "}
            <span className="text-teal-500">Going global.</span>
          </h2>
          <p className="mt-4 text-navy-400 max-w-lg mx-auto text-lg">
            We&apos;re launching with the Isle of Spice, then expanding across
            the Caribbean and beyond.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {islands.map((island, i) => (
            <div
              key={island.name}
              className={`relative rounded-3xl p-6 text-center transition-all duration-500 hover:-translate-y-2 ${
                island.active
                  ? "bg-gradient-to-br from-gold-500 to-gold-600 text-white shadow-[0_8px_30px_rgba(200,145,46,0.3)]"
                  : "bg-white text-navy-600 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]"
              }`}
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              {island.active && (
                <div className="absolute -top-2 -right-2 w-5 h-5 bg-teal-400 rounded-full flex items-center justify-center">
                  <span className="text-[10px]">✓</span>
                </div>
              )}
              <span className="text-4xl block">{island.flag}</span>
              <h4 className="font-bold mt-4 text-sm leading-tight">
                {island.name}
              </h4>
              <p
                className={`text-xs mt-1 ${
                  island.active ? "text-gold-100" : "text-navy-300"
                }`}
              >
                {island.tagline}
              </p>
              <span
                className={`inline-block text-[11px] font-semibold mt-3 px-3 py-1 rounded-full ${
                  island.active
                    ? "bg-white/20 text-white"
                    : "bg-cream-100 text-navy-400"
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
