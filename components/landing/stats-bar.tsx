const stats = [
  { value: "7,200+", label: "Listings", sublabel: "Across the Caribbean" },
  { value: "21", label: "Islands", sublabel: "And growing" },
  { value: "9", label: "Categories", sublabel: "Stays, tours, dining & more" },
  { value: "3%", label: "Commission", sublabel: "Lowest in the industry" },
];

export function StatsBar() {
  return (
    <section className="py-16 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p
                className="text-3xl md:text-4xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {stat.value}
              </p>
              <p className="text-sm font-semibold text-gold-500 mt-1 uppercase tracking-wider">
                {stat.label}
              </p>
              <p className="text-xs text-navy-400 mt-1">{stat.sublabel}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
