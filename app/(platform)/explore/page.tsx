"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import {
  Search,
  MapPin,
  SlidersHorizontal,
  Home,
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
  Star,
} from "lucide-react";

const categories = [
  { id: "all", label: "All", icon: Search },
  { id: "stay", label: "Stays", icon: Home },
  { id: "tour", label: "Tours", icon: Compass },
  { id: "dining", label: "Dining", icon: UtensilsCrossed },
  { id: "event", label: "Events", icon: Music },
  { id: "transport", label: "Transport", icon: Car },
  { id: "guide", label: "Guides", icon: Users },
];

// Placeholder listings for demo
const demoListings = [
  {
    id: "1",
    title: "Beachfront Villa with Ocean Views",
    type: "stay",
    image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80&auto=format",
    price: 250,
    priceUnit: "night",
    rating: 4.9,
    reviewCount: 47,
    location: "Grand Anse, Grenada",
  },
  {
    id: "2",
    title: "Sunset Sailing & Snorkeling Tour",
    type: "tour",
    image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&q=80&auto=format",
    price: 85,
    priceUnit: "person",
    rating: 4.95,
    reviewCount: 124,
    location: "St. George's, Grenada",
  },
  {
    id: "3",
    title: "BB's Crab Back Restaurant",
    type: "dining",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80&auto=format",
    price: 35,
    priceUnit: "avg meal",
    rating: 4.7,
    reviewCount: 89,
    location: "St. George's, Grenada",
  },
  {
    id: "4",
    title: "Spicemas Carnival Fete",
    type: "event",
    image: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&q=80&auto=format",
    price: 45,
    priceUnit: "ticket",
    rating: 4.8,
    reviewCount: 56,
    location: "St. George's, Grenada",
  },
  {
    id: "5",
    title: "Airport to Grand Anse Transfer",
    type: "transport",
    image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80&auto=format",
    price: 30,
    priceUnit: "trip",
    rating: 4.85,
    reviewCount: 203,
    location: "Maurice Bishop Airport",
  },
  {
    id: "6",
    title: "Chef Marcus — Private Island Food Tour",
    type: "guide",
    image: "https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=600&q=80&auto=format",
    price: 120,
    priceUnit: "person",
    rating: 5.0,
    reviewCount: 34,
    location: "St. George's, Grenada",
  },
  {
    id: "7",
    title: "Rainforest Eco Lodge",
    type: "stay",
    image: "https://images.unsplash.com/photo-1602002418816-5c0aeef426aa?w=600&q=80&auto=format",
    price: 180,
    priceUnit: "night",
    rating: 4.85,
    reviewCount: 31,
    location: "Grand Etang, Grenada",
  },
  {
    id: "8",
    title: "Underwater Sculpture Park Dive",
    type: "tour",
    image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80&auto=format",
    price: 95,
    priceUnit: "person",
    rating: 4.92,
    reviewCount: 78,
    location: "Moliniere Bay, Grenada",
  },
];

const typeColors: Record<string, string> = {
  stay: "bg-gold-500",
  tour: "bg-teal-500",
  dining: "bg-gold-600",
  event: "bg-teal-600",
  transport: "bg-navy-500",
  guide: "bg-gold-500",
};

export default function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = demoListings.filter((listing) => {
    if (activeCategory !== "all" && listing.type !== activeCategory) return false;
    if (searchQuery && !listing.title.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        {/* Search Header */}
        <div className="bg-white shadow-sm sticky top-16 z-40">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 flex items-center gap-3 bg-cream-50 rounded-xl px-4 py-3">
                <Search size={18} className="text-navy-300 shrink-0" />
                <input
                  type="text"
                  placeholder="Search stays, tours, dining, events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-3 rounded-xl bg-cream-50 text-navy-500 hover:bg-cream-100 transition-colors text-sm font-medium">
                <SlidersHorizontal size={16} />
                <span className="hidden sm:inline">Filters</span>
              </button>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    activeCategory === cat.id
                      ? "bg-navy-700 text-white"
                      : "bg-cream-50 text-navy-500 hover:bg-cream-100"
                  }`}
                >
                  <cat.icon size={16} />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-navy-400 text-sm">
              <span className="font-semibold text-navy-700">{filtered.length}</span>{" "}
              experiences in Grenada
            </p>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-gold-500" />
              <span className="text-sm font-medium text-navy-600">Grenada</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((listing) => (
              <div
                key={listing.id}
                className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              >
                {/* Image */}
                <div className="relative h-52 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                    style={{ backgroundImage: `url(${listing.image})` }}
                  />
                  <div className="absolute top-3 left-3">
                    <span
                      className={`${typeColors[listing.type]} text-white text-xs font-semibold px-2.5 py-1 rounded-full`}
                    >
                      {listing.type.charAt(0).toUpperCase() + listing.type.slice(1)}
                    </span>
                  </div>
                  <button className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-navy-600"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-navy-400">{listing.location}</p>
                    <div className="flex items-center gap-1">
                      <Star size={12} className="text-gold-500 fill-gold-500" />
                      <span className="text-xs font-semibold text-navy-700">
                        {listing.rating}
                      </span>
                      <span className="text-xs text-navy-300">
                        ({listing.reviewCount})
                      </span>
                    </div>
                  </div>
                  <h3 className="font-semibold text-navy-700 leading-snug line-clamp-2 group-hover:text-gold-600 transition-colors">
                    {listing.title}
                  </h3>
                  <p className="mt-2">
                    <span className="font-bold text-navy-700">
                      ${listing.price}
                    </span>
                    <span className="text-navy-400 text-sm">
                      {" "}
                      / {listing.priceUnit}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
