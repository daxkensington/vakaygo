import { LISTING_TYPES } from "@/lib/listing-filters";

const stats = [
  { value: "8,000+", label: "Listings", sublabel: "Caribbean, LatAm & Mediterranean" },
  { value: "34", label: "Destinations", sublabel: "3 global sun & sea regions" },
  { value: String(LISTING_TYPES.length), label: "Categories", sublabel: "Stays, charters, tours & dining" },
  { value: "0%", label: "Guest Fee", sublabel: "Protected bookings + 2% VakayCash" },
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
              <p className="text-sm font-semibold text-gold-700 mt-1 uppercase tracking-wider">
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
