import Link from "next/link";
import { Home, Compass, UtensilsCrossed, Music, Car, Users, Shield, Plane, Sparkles } from "lucide-react";

const categories = [
  {
    icon: Home,
    name: "Stays",
    slug: "stay",
    description: "Villas, guesthouses & boutique hotels",
    image:
      "/images/sections/stays.jpg",
  },
  {
    icon: Compass,
    name: "Excursions",
    slug: "excursion",
    description: "Boat charters, coast hopping & adventure days",
    image: "/images/categories/excursion.jpg",
  },
  {
    icon: Compass,
    name: "Tours",
    slug: "tour",
    description: "Walking tours, sightseeing & cultural experiences",
    image:
      "/images/sections/tours.jpg",
  },
  {
    icon: UtensilsCrossed,
    name: "Dining",
    slug: "dining",
    description: "Local spots, street food & fine dining",
    image:
      "/images/sections/dining.jpg",
  },
  {
    icon: Music,
    name: "Events",
    slug: "event",
    description: "Fetes, festivals & beach parties",
    image:
      "/images/sections/events.jpg",
  },
  {
    icon: Plane,
    name: "Airport Transfers",
    slug: "transfer",
    description: "Meet & greet, flight tracking, door-to-door",
    image: "/images/categories/transfer.jpg",
  },
  {
    icon: Car,
    name: "Transport",
    slug: "transport",
    description: "Car rental, taxi, water taxi & ferry",
    image:
      "/images/sections/transport.jpg",
  },
  {
    icon: Shield,
    name: "VIP Services",
    slug: "vip",
    description: "Security, concierge & luxury transfers",
    image: "/images/categories/vip.jpg",
  },
  {
    icon: Users,
    name: "Guides",
    slug: "guide",
    description: "Expert locals who show you the real destination",
    image:
      "/images/sections/guides.jpg",
  },
  {
    icon: Sparkles,
    name: "Spa & Wellness",
    slug: "spa",
    description: "Spa treatments, massages & wellness retreats",
    image: "/images/categories/spa.jpg",
  },
];

export function Categories() {
  return (
    <section id="categories" className="scroll-mt-28 bg-cream-50 py-10 md:py-14">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-6 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold-700">
            All-in-One Platform
          </p>
          <h2
            className="text-2xl font-bold tracking-tight text-navy-700 md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ten ways to explore
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-navy-400">
            Everything a traveler needs. Everything a local business can offer.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/explore?type=${cat.slug}`}
              prefetch={false}
              className="rounded-2xl border border-cream-200 bg-white p-3 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-offset-2 md:p-4"
            >
              <div className="flex items-start gap-2">
                <cat.icon size={20} aria-hidden="true" className="shrink-0 text-gold-700" />
                <h3 className="text-sm font-semibold leading-5 text-navy-700">{cat.name}</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-navy-500">{cat.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
