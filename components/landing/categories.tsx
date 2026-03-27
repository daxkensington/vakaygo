import { Home, Compass, UtensilsCrossed, Music, Car, Users } from "lucide-react";

const categories = [
  {
    icon: Home,
    name: "Stays",
    description: "Villas, guesthouses, and boutique hotels",
    color: "bg-gold-50 text-gold-600",
    count: "Coming soon",
  },
  {
    icon: Compass,
    name: "Tours & Excursions",
    description: "Sailing, hiking, snorkeling, and more",
    color: "bg-teal-50 text-teal-600",
    count: "Coming soon",
  },
  {
    icon: UtensilsCrossed,
    name: "Dining",
    description: "Local restaurants, street food, and fine dining",
    color: "bg-gold-50 text-gold-600",
    count: "Coming soon",
  },
  {
    icon: Music,
    name: "Events & Nightlife",
    description: "Fetes, festivals, concerts, and beach parties",
    color: "bg-teal-50 text-teal-600",
    count: "Coming soon",
  },
  {
    icon: Car,
    name: "Transport",
    description: "Airport transfers, island tours, water taxis",
    color: "bg-gold-50 text-gold-600",
    count: "Coming soon",
  },
  {
    icon: Users,
    name: "Local Guides",
    description: "Expert locals who show you the real island",
    color: "bg-teal-50 text-teal-600",
    count: "Coming soon",
  },
];

export function Categories() {
  return (
    <section id="categories" className="py-20 md:py-28 bg-cream-50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Everything you need,{" "}
            <span className="text-gold-500">one platform</span>
          </h2>
          <p className="mt-4 text-navy-400 max-w-xl mx-auto">
            No more bouncing between Airbnb, Viator, Google Maps, and WhatsApp.
            VakayGo has it all.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <div
              key={cat.name}
              className="group bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1 cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${cat.color}`}
                >
                  <cat.icon size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy-700 group-hover:text-gold-500 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-sm text-navy-400 mt-1">{cat.description}</p>
                  <span className="inline-block mt-3 text-xs font-semibold text-teal-500 bg-teal-50 px-3 py-1 rounded-full">
                    {cat.count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
