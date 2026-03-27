import { Home, Compass, UtensilsCrossed, Music, Car, Users } from "lucide-react";

const categories = [
  {
    icon: Home,
    name: "Stays",
    description: "Villas, guesthouses & boutique hotels",
    image:
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80&auto=format",
  },
  {
    icon: Compass,
    name: "Tours",
    description: "Sailing, hiking, snorkeling & more",
    image:
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&q=80&auto=format",
  },
  {
    icon: UtensilsCrossed,
    name: "Dining",
    description: "Local spots, street food & fine dining",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80&auto=format",
  },
  {
    icon: Music,
    name: "Events",
    description: "Fetes, festivals & beach parties",
    image:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&q=80&auto=format",
  },
  {
    icon: Car,
    name: "Transport",
    description: "Airport transfers & island tours",
    image:
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80&auto=format",
  },
  {
    icon: Users,
    name: "Guides",
    description: "Expert locals who show you the real island",
    image:
      "https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=600&q=80&auto=format",
  },
];

export function Categories() {
  return (
    <section id="categories" className="py-24 md:py-32 bg-cream-50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">
            All-in-One Platform
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Six ways to explore
          </h2>
          <p className="mt-4 text-navy-400 max-w-lg mx-auto text-lg">
            Everything a traveler needs. Everything a local business can offer.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <div
              key={cat.name}
              className="group relative h-72 rounded-3xl overflow-hidden cursor-pointer shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-500"
            >
              {/* Background image */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url(${cat.image})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/30 to-transparent" />
              <div className="absolute inset-0 bg-navy-900/10 group-hover:bg-navy-900/0 transition-colors duration-500" />

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-7">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                    <cat.icon size={20} className="text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{cat.name}</h3>
                </div>
                <p className="text-white/70 text-sm pl-[52px]">
                  {cat.description}
                </p>
              </div>

              {/* Coming soon badge */}
              <div className="absolute top-5 right-5">
                <span className="bg-white/20 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                  Coming soon
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
