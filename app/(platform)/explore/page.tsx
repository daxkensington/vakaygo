"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/header";
import { ListingCard } from "@/components/listings/listing-card";
import { ListingSkeletonGrid } from "@/components/listings/listing-skeleton";
import {
  Search,
  MapPin,

  Home,
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
  Loader2,
  LayoutGrid,
  Map,
  Calendar,
  X,
  Star,
  DollarSign,
} from "lucide-react";

const MapView = dynamic(() => import("@/components/listings/map-view"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] bg-cream-100 rounded-2xl flex items-center justify-center">
      <Loader2 className="animate-spin text-navy-300" size={32} />
    </div>
  ),
});

const categoryTabs = [
  { id: "all", label: "All", icon: Search },
  { id: "stay", label: "Stays", icon: Home },
  { id: "excursion", label: "Excursions", icon: Compass },
  { id: "tour", label: "Tours", icon: Compass },
  { id: "dining", label: "Dining", icon: UtensilsCrossed },
  { id: "event", label: "Events", icon: Music },
  { id: "transfer", label: "Transfers", icon: Car },
  { id: "transport", label: "Transport", icon: Car },
  { id: "vip", label: "VIP Services", icon: Users },
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
  latitude: string | null;
  longitude: string | null;
};

export default function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [activeIsland, setActiveIsland] = useState("");
  const [sortBy, setSortBy] = useState("recommended");
  const [selectedDate, setSelectedDate] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRating, setMinRating] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const PAGE_SIZE = 24;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get("type");
    const islandParam = params.get("island");
    if (typeParam) setActiveCategory(typeParam);
    if (islandParam) setActiveIsland(islandParam);
  }, []);

  // SEO: Update document title based on active filters
  useEffect(() => {
    const parts: string[] = [];
    if (activeCategory !== "all") {
      const label = categoryTabs.find((c) => c.id === activeCategory)?.label;
      if (label) parts.push(label);
    }
    if (activeIsland) {
      parts.push(
        activeIsland
          .replace(/-/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase())
      );
    }
    if (searchQuery) {
      parts.push(`"${searchQuery}"`);
    }
    const suffix = parts.length > 0 ? parts.join(" in ") + " — " : "";
    document.title = `${suffix}Explore Caribbean Experiences | VakayGo`;
  }, [activeCategory, activeIsland, searchQuery]);

  useEffect(() => {
    async function fetchListings() {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("type", activeCategory);
      if (searchQuery) params.set("q", searchQuery);
      if (activeIsland) params.set("island", activeIsland);
      if (selectedDate) params.set("date", selectedDate);
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (minRating) params.set("minRating", minRating);
      if (sortBy !== "recommended") params.set("sort", sortBy);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      try {
        const res = await fetch(`/api/listings?${params}`);
        const data = await res.json();
        const newListings = data.listings || [];
        if (page === 0) {
          setListings(newListings);
        } else {
          setListings((prev) => [...prev, ...newListings]);
        }
        setHasMore(newListings.length === PAGE_SIZE);
      } catch {
        setListings([]);
      } finally {
        setLoading(false);
      }
    }

    const debounce = setTimeout(fetchListings, searchQuery ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [activeCategory, searchQuery, activeIsland, selectedDate, minPrice, maxPrice, minRating, page, sortBy]);

  // Reset page and fetch count when filters change
  useEffect(() => {
    setPage(0);
    setHasMore(true);

    // Fetch total count
    const countParams = new URLSearchParams();
    if (activeCategory !== "all") countParams.set("type", activeCategory);
    if (searchQuery) countParams.set("q", searchQuery);
    if (activeIsland) countParams.set("island", activeIsland);
    if (selectedDate) countParams.set("date", selectedDate);
    if (minPrice) countParams.set("minPrice", minPrice);
    if (maxPrice) countParams.set("maxPrice", maxPrice);
    if (minRating) countParams.set("minRating", minRating);
    fetch(`/api/listings/count?${countParams}`)
      .then((r) => r.json())
      .then((d) => setTotalCount(d.count || 0))
      .catch(() => {});
  }, [activeCategory, searchQuery, activeIsland, selectedDate, minPrice, maxPrice, minRating, sortBy]);

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        {/* Search Header */}
        <div className="bg-white shadow-sm sticky top-16 z-40">
          <div className="mx-auto max-w-7xl px-4 md:px-6 py-3 md:py-4">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
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
              <div className="flex items-center gap-2 bg-cream-50 rounded-xl px-3 py-2">
                <Calendar size={16} className="text-navy-300 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-navy-700 text-sm font-medium outline-none cursor-pointer"
                  min={new Date().toISOString().split("T")[0]}
                  placeholder="Any date"
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
              {/* Price Range */}
              <div className="flex items-center gap-1.5 bg-cream-50 rounded-xl px-3 py-2">
                <DollarSign size={16} className="text-navy-300 shrink-0" />
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-16 bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                  min="0"
                />
                <span className="text-navy-300 text-sm">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-16 bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                  min="0"
                />
              </div>
              {/* Rating Filter */}
              <select
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="px-4 py-3 rounded-xl bg-cream-50 text-navy-700 text-sm font-medium outline-none appearance-none cursor-pointer hover:bg-cream-100 transition-colors"
              >
                <option value="">Any Rating</option>
                <option value="3">3+ Stars</option>
                <option value="4">4+ Stars</option>
                <option value="4.5">4.5+ Stars</option>
              </select>
              {/* View Toggle */}
              <div className="flex items-center bg-cream-50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                    viewMode === "grid"
                      ? "bg-navy-700 text-white"
                      : "text-navy-500 hover:bg-cream-100"
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid size={16} />
                  <span className="hidden sm:inline">Grid</span>
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                    viewMode === "map"
                      ? "bg-navy-700 text-white"
                      : "text-navy-500 hover:bg-cream-100"
                  }`}
                  title="Map view"
                >
                  <Map size={16} />
                  <span className="hidden sm:inline">Map</span>
                </button>
              </div>
            </div>

            {/* Active Filters Pills */}
            {(activeCategory !== "all" || activeIsland || searchQuery || selectedDate || minPrice || maxPrice || minRating) && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-xs text-navy-400 font-medium">Active:</span>
                {activeCategory !== "all" && (
                  <button
                    onClick={() => setActiveCategory("all")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    {categoryTabs.find((c) => c.id === activeCategory)?.label || activeCategory}
                    <X size={12} />
                  </button>
                )}
                {activeIsland && (
                  <button
                    onClick={() => setActiveIsland("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    {activeIsland.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    <X size={12} />
                  </button>
                )}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    &ldquo;{searchQuery}&rdquo;
                    <X size={12} />
                  </button>
                )}
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    {selectedDate}
                    <X size={12} />
                  </button>
                )}
                {minPrice && (
                  <button
                    onClick={() => setMinPrice("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    Min ${minPrice}
                    <X size={12} />
                  </button>
                )}
                {maxPrice && (
                  <button
                    onClick={() => setMaxPrice("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    Max ${maxPrice}
                    <X size={12} />
                  </button>
                )}
                {minRating && (
                  <button
                    onClick={() => setMinRating("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    <Star size={10} className="fill-current" /> {minRating}+ Stars
                    <X size={12} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveCategory("all");
                    setSearchQuery("");
                    setActiveIsland("");
                    setSelectedDate("");
                    setMinPrice("");
                    setMaxPrice("");
                    setMinRating("");
                  }}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-gold-600 hover:text-gold-700 transition-colors underline"
                >
                  Clear All
                </button>
              </div>
            )}

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
        {viewMode === "map" ? (
          /* ── Map View ─────────────────────────────────────────── */
          <div className="mx-auto max-w-[1600px] px-4 py-4">
            <div className="flex items-center justify-between mb-4 px-2">
              <p className="text-navy-400 text-sm">
                Showing{" "}
                <span className="font-semibold text-navy-700">
                  {loading && listings.length === 0 ? "..." : listings.length.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-navy-700">
                  {loading && listings.length === 0 ? "..." : totalCount.toLocaleString()}
                </span>{" "}
                experiences{activeIsland ? ` in ${activeIsland.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())}` : " across the Caribbean"}
              </p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm font-medium text-navy-600 bg-transparent outline-none cursor-pointer"
              >
                <option value="recommended">Recommended</option>
                <option value="rating">Highest Rated</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="newest">Newest</option>
                <option value="most-reviews">Most Reviews</option>
              </select>
            </div>

            {/* Desktop: sidebar + map | Mobile: stacked */}
            <div className="flex flex-col lg:flex-row gap-4" style={{ height: "calc(100vh - 240px)" }}>
              {/* Listing sidebar */}
              <div className="lg:w-[40%] overflow-y-auto pr-1 order-2 lg:order-1 max-h-[50vh] lg:max-h-none">
                {loading && listings.length === 0 ? (
                  <ListingSkeletonGrid count={4} />
                ) : listings.length === 0 ? (
                  <div className="text-center py-12">
                    <Compass size={32} className="text-navy-200 mx-auto mb-3" />
                    <p className="text-navy-500 font-semibold">No listings found</p>
                    <button
                      onClick={() => { setActiveCategory("all"); setSearchQuery(""); setActiveIsland(""); setSelectedDate(""); setMinPrice(""); setMaxPrice(""); setMinRating(""); }}
                      className="mt-4 bg-gold-500 hover:bg-gold-600 text-white px-5 py-2 rounded-xl font-semibold transition-colors text-sm"
                    >
                      Clear Filters
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                      {listings.map((listing) => (
                        <ListingCard key={listing.id} {...listing} />
                      ))}
                    </div>
                    {hasMore && listings.length > 0 && (
                      <div className="text-center mt-6 pb-4">
                        <button
                          onClick={() => setPage((p) => p + 1)}
                          className="bg-white hover:bg-cream-50 text-navy-600 px-6 py-2.5 rounded-xl font-semibold shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all text-sm"
                        >
                          Load More
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Map */}
              <div className="lg:w-[60%] order-1 lg:order-2 min-h-[300px] lg:min-h-0 rounded-2xl overflow-hidden shadow-[var(--shadow-card)]">
                <MapView listings={listings} activeIsland={activeIsland} />
              </div>
            </div>
          </div>
        ) : (
          /* ── Grid View ────────────────────────────────────────── */
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <p className="text-navy-400 text-sm">
                Showing{" "}
                <span className="font-semibold text-navy-700">
                  {loading && listings.length === 0 ? "..." : listings.length.toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-navy-700">
                  {loading && listings.length === 0 ? "..." : totalCount.toLocaleString()}
                </span>{" "}
                experiences{activeIsland ? ` in ${activeIsland.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())}` : " across the Caribbean"}
              </p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm font-medium text-navy-600 bg-transparent outline-none cursor-pointer"
              >
                <option value="recommended">Recommended</option>
                <option value="rating">Highest Rated</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="newest">Newest</option>
                <option value="most-reviews">Most Reviews</option>
              </select>
            </div>

            {loading && listings.length === 0 ? (
              <ListingSkeletonGrid count={8} />
            ) : listings.length === 0 ? (
              <div className="text-center py-20">
                <Compass size={40} className="text-navy-200 mx-auto mb-4" />
                <p className="text-navy-500 text-lg font-semibold">No listings found</p>
                <p className="text-navy-400 text-sm mt-2 max-w-md mx-auto">
                  Try adjusting your filters, searching for something else, or exploring a different island.
                </p>
                <button
                  onClick={() => { setActiveCategory("all"); setSearchQuery(""); setActiveIsland(""); setSelectedDate(""); setMinPrice(""); setMaxPrice(""); setMinRating(""); }}
                  className="mt-6 bg-gold-500 hover:bg-gold-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors text-sm"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} {...listing} />
                  ))}
                </div>

                {hasMore && listings.length > 0 && (
                  <div className="text-center mt-10">
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      className="bg-white hover:bg-cream-50 text-navy-600 px-8 py-3 rounded-xl font-semibold shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all"
                    >
                      Load More
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
