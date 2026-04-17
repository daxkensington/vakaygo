import Link from "next/link";
import { Home, Compass, UtensilsCrossed, Music, Car, Users, ArrowRight, Shield, Plane, Sparkles } from "lucide-react";

const categories = [
  {
    icon: Home,
    name: "Stays",
    slug: "stay",
    count: 682,
    description: "Villas, guesthouses & boutique hotels",
    image:
      "/images/sections/stays.jpg",
  },
  {
    icon: Compass,
    name: "Excursions",
    slug: "excursion",
    count: 1192,
    description: "Boat trips, island hopping & adventure days",
    image: "/images/categories/excursion.jpg",
  },
  {
    icon: Compass,
    name: "Tours",
    slug: "tour",
    count: 2227,
    description: "Walking tours, sightseeing & cultural experiences",
    image:
      "/images/sections/tours.jpg",
  },
  {
    icon: UtensilsCrossed,
    name: "Dining",
    slug: "dining",
    count: 1615,
    description: "Local spots, street food & fine dining",
    image:
      "/images/sections/dining.jpg",
  },
  {
    icon: Music,
    name: "Events",
    slug: "event",
    count: 86,
    description: "Fetes, festivals & beach parties",
    image:
      "/images/sections/events.jpg",
  },
  {
    icon: Plane,
    name: "Airport Transfers",
    slug: "transfer",
    count: 508,
    description: "Meet & greet, flight tracking, door-to-door",
    image: "/images/categories/transfer.jpg",
  },
  {
    icon: Car,
    name: "Transport",
    slug: "transport",
    count: 419,
    description: "Car rental, taxi, water taxi & ferry",
    image:
      "/images/sections/transport.jpg",
  },
  {
    icon: Shield,
    name: "VIP Services",
    slug: "vip",
    count: 498,
    description: "Security, concierge & luxury transfers",
    image: "/images/categories/vip.jpg",
  },
  {
    icon: Users,
    name: "Guides",
    slug: "guide",
    count: 3,
    description: "Expert locals who show you the real island",
    image:
      "/images/sections/guides.jpg",
  },
  {
    icon: Sparkles,
    name: "Spa & Wellness",
    slug: "spa",
    count: 0,
    description: "Spa treatments, massages & wellness retreats",
    image: "/images/categories/spa.jpg",
  },
];

export function Categories() {
  return (
    <section id="categories" className="py-24 md:py-32 bg-cream-50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
            All-in-One Platform
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ten ways to explore
          </h2>
          <p className="mt-4 text-navy-400 max-w-lg mx-auto text-lg">
            Everything a traveler needs. Everything a local business can offer.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/explore?type=${cat.slug}`}
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

              {/* Count + arrow */}
              <div className="absolute top-5 right-5 flex items-center gap-2">
                <span className="bg-white/20 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                  {cat.count > 0 ? `${cat.count} listings` : "Coming soon"}
                </span>
              </div>

              {/* Explore arrow */}
              <div className="absolute bottom-7 right-7 w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                <ArrowRight size={18} className="text-white" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
