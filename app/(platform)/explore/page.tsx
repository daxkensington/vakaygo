"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import Link from "next/link";
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
  Loader2,
} from "lucide-react";

const categoryTabs = [
  { id: "all", label: "All", icon: Search },
  { id: "stay", label: "Stays", icon: Home },
  { id: "tour", label: "Tours", icon: Compass },
  { id: "dining", label: "Dining", icon: UtensilsCrossed },
  { id: "event", label: "Events", icon: Music },
  { id: "transport", label: "Transport", icon: Car },
  { id: "guide", label: "Guides", icon: Users },
];

const typeColors: Record<string, string> = {
  stay: "bg-gold-500",
  tour: "bg-teal-500",
  dining: "bg-gold-600",
  event: "bg-teal-600",
  transport: "bg-navy-500",
  guide: "bg-gold-500",
};

type Listing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  headline: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  isFeatured: boolean | null;
  islandSlug: string;
  islandName: string;
  image: string | null;
};

export default function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeIsland, setActiveIsland] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get("type");
    const islandParam = params.get("island");
    if (typeParam) setActiveCategory(typeParam);
    if (islandParam) setActiveIsland(islandParam);
  }, []);

  useEffect(() => {
    async function fetchListings() {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("type", activeCategory);
      if (searchQuery) params.set("q", searchQuery);
      if (activeIsland) params.set("island", activeIsland);

      try {
        const res = await fetch(`/api/listings?${params}`);
        const data = await res.json();
        setListings(data.listings || []);
      } catch {
        setListings([]);
      } finally {
        setLoading(false);
      }
    }

    const debounce = setTimeout(fetchListings, searchQuery ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [activeCategory, searchQuery, activeIsland]);

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
              <select
                value={activeIsland}
                onChange={(e) => setActiveIsland(e.target.value)}
                className="px-4 py-3 rounded-xl bg-cream-50 text-navy-700 text-sm font-medium outline-none appearance-none cursor-pointer hover:bg-cream-100 transition-colors"
              >
                <option value="">All Islands</option>
                <option value="grenada">🇬🇩 Grenada</option>
                <option value="trinidad-and-tobago">🇹🇹 Trinidad & Tobago</option>
                <option value="barbados">🇧🇧 Barbados</option>
                <option value="st-lucia">🇱🇨 St. Lucia</option>
                <option value="jamaica">🇯🇲 Jamaica</option>
                <option value="bahamas">🇧🇸 Bahamas</option>
                <option value="antigua">🇦🇬 Antigua</option>
                <option value="dominica">🇩🇲 Dominica</option>
                <option value="st-vincent">🇻🇨 St. Vincent</option>
                <option value="aruba">🇦🇼 Aruba</option>
                <option value="curacao">🇨🇼 Curaçao</option>
                <option value="cayman-islands">🇰🇾 Cayman Islands</option>
                <option value="puerto-rico">🇵🇷 Puerto Rico</option>
                <option value="dominican-republic">🇩🇴 Dominican Republic</option>
                <option value="turks-and-caicos">🇹🇨 Turks & Caicos</option>
                <option value="us-virgin-islands">🇻🇮 USVI</option>
                <option value="british-virgin-islands">🇻🇬 BVI</option>
                <option value="st-kitts">🇰🇳 St. Kitts</option>
                <option value="martinique">🇲🇶 Martinique</option>
                <option value="guadeloupe">🇬🇵 Guadeloupe</option>
                <option value="bonaire">Bonaire</option>
              </select>
              <button className="flex items-center gap-2 px-4 py-3 rounded-xl bg-cream-50 text-navy-500 hover:bg-cream-100 transition-colors text-sm font-medium">
                <SlidersHorizontal size={16} />
                <span className="hidden sm:inline">Filters</span>
              </button>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
              {categoryTabs.map((cat) => (
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
              <span className="font-semibold text-navy-700">
                {loading ? "..." : listings.length}
              </span>{" "}
              experiences{activeIsland ? ` in ${activeIsland.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())}` : " across the Caribbean"}
            </p>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-gold-500" />
              <span className="text-sm font-medium text-navy-600">
                {activeIsland ? activeIsland.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "All Islands"}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-gold-500" />
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-navy-400 text-lg">No listings found</p>
              <p className="text-navy-300 text-sm mt-2">
                Try a different search or category
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {listings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/${listing.islandSlug}/${listing.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Image */}
                  <div className="relative h-52 overflow-hidden">
                    {listing.image ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                        style={{ backgroundImage: `url(${listing.image})` }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-cream-200 flex items-center justify-center">
                        <span className="text-navy-300">No image</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span
                        className={`${typeColors[listing.type] || "bg-navy-500"} text-white text-xs font-semibold px-2.5 py-1 rounded-full`}
                      >
                        {listing.type.charAt(0).toUpperCase() +
                          listing.type.slice(1)}
                      </span>
                    </div>
                    {listing.isFeatured && (
                      <div className="absolute top-3 right-3">
                        <span className="bg-gold-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                          Featured
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-navy-400">
                        {listing.parish}, {listing.islandName}
                      </p>
                      {listing.avgRating && parseFloat(listing.avgRating) > 0 && (
                        <div className="flex items-center gap-1">
                          <Star
                            size={12}
                            className="text-gold-500 fill-gold-500"
                          />
                          <span className="text-xs font-semibold text-navy-700">
                            {parseFloat(listing.avgRating).toFixed(1)}
                          </span>
                          <span className="text-xs text-navy-300">
                            ({listing.reviewCount})
                          </span>
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-navy-700 leading-snug line-clamp-2 group-hover:text-gold-600 transition-colors">
                      {listing.title}
                    </h3>
                    {listing.priceAmount && (
                      <p className="mt-2">
                        <span className="font-bold text-navy-700">
                          ${parseFloat(listing.priceAmount).toFixed(0)}
                        </span>
                        <span className="text-navy-400 text-sm">
                          {" "}
                          / {listing.priceUnit}
                        </span>
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
