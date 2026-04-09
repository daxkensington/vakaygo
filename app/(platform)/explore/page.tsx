"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { analytics } from "@/lib/analytics";
import { Header } from "@/components/layout/header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { RecentlyViewed } from "@/components/listings/recently-viewed";
import { ListingCard } from "@/components/listings/listing-card";
import { ListingSkeletonGrid } from "@/components/listings/listing-skeleton";
import { SearchAutocomplete } from "@/components/search/search-autocomplete";
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
  Sparkles,
  UserPlus,
  Minus,
  Plus,
  Clock,
  Wifi,
  Waves,
  Wind,
  ChefHat,
  ParkingCircle,
  Palmtree,
  Eye,
  PawPrint,
  History,
  Trash2,
} from "lucide-react";

const CaribbeanMap = dynamic(() => import("@/components/listings/caribbean-map"), {
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

const amenityOptions = [
  { id: "wifi", label: "WiFi", icon: Wifi },
  { id: "pool", label: "Pool", icon: Waves },
  { id: "ac", label: "AC", icon: Wind },
  { id: "kitchen", label: "Kitchen", icon: ChefHat },
  { id: "parking", label: "Parking", icon: ParkingCircle },
  { id: "beach-access", label: "Beach Access", icon: Palmtree },
  { id: "ocean-view", label: "Ocean View", icon: Eye },
  { id: "pet-friendly", label: "Pet Friendly", icon: PawPrint },
];

const durationOptions = [
  { id: "under-2", label: "Under 2 hours" },
  { id: "2-4", label: "2-4 hours" },
  { id: "4-8", label: "4-8 hours" },
  { id: "full-day", label: "Full day (8+)" },
  { id: "multi-day", label: "Multi-day" },
];

const cuisineOptions = [
  "Caribbean",
  "Seafood",
  "International",
  "Italian",
  "Indian",
  "Mexican",
  "BBQ",
  "Vegetarian",
];

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
  const [guestCount, setGuestCount] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedDuration, setSelectedDuration] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [freeCancellation, setFreeCancellation] = useState(false);
  const [cuisineType, setCuisineType] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiResultsSummary, setAiResultsSummary] = useState("");
  const PAGE_SIZE = 24;

  // AI smart search keywords that trigger natural language parsing
  const AI_TRIGGER_WORDS = ["romantic", "budget", "best", "cheap", "luxury", "family", "adventure", "quiet", "popular", "top", "amazing", "beautiful", "relaxing", "fun", "unique", "authentic", "cozy", "stunning"];

  // Fetch search history on mount
  useEffect(() => {
    fetch("/api/search-history")
      .then((r) => r.json())
      .then((d) => setSearchHistory(d.history || []))
      .catch(() => {});
  }, []);

  async function saveSearchHistory(query: string) {
    if (!query.trim()) return;
    try {
      await fetch("/api/search-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      setSearchHistory((prev) => {
        const filtered = prev.filter((h) => h !== query.trim());
        return [query.trim(), ...filtered].slice(0, 10);
      });
    } catch {
      // silently fail
    }
  }

  async function clearSearchHistory() {
    try {
      await fetch("/api/search-history", { method: "DELETE" });
      setSearchHistory([]);
    } catch {
      // silently fail
    }
  }

  function isNaturalLanguageQuery(q: string): boolean {
    if (q.length > 20) return true;
    const lower = q.toLowerCase();
    return AI_TRIGGER_WORDS.some((word) => lower.includes(word));
  }

  async function handleSmartSearch(query: string) {
    if (!isNaturalLanguageQuery(query)) {
      setAiSearchActive(false);
      setAiSummary("");
      setAiSuggestions([]);
      setAiResultsSummary("");
      return;
    }

    setAiSearchLoading(true);
    setAiResultsSummary("");
    try {
      const res = await fetch("/api/ai/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) return;

      const { filters, summary, suggestions } = await res.json();
      setAiSearchActive(true);
      setAiSummary(summary || "");
      setAiSuggestions(Array.isArray(suggestions) ? suggestions : []);

      // Apply parsed filters
      if (filters.type) setActiveCategory(filters.type);
      if (filters.island) setActiveIsland(filters.island);
      if (filters.minPrice) setMinPrice(String(filters.minPrice));
      if (filters.maxPrice) setMaxPrice(String(filters.maxPrice));
      if (filters.minRating) setMinRating(String(filters.minRating));
      if (filters.guests) setGuestCount(String(filters.guests));
      if (Array.isArray(filters.amenities) && filters.amenities.length > 0)
        setSelectedAmenities(filters.amenities);
      if (filters.duration) setSelectedDuration(filters.duration);
      if (filters.q) setSearchQuery(filters.q);
    } catch {
      // Fall back to normal search
      setAiSearchActive(false);
      setAiSummary("");
      setAiSuggestions([]);
    } finally {
      setAiSearchLoading(false);
    }
  }

  // Fetch AI results summary when results load from an AI search
  useEffect(() => {
    if (!aiSearchActive || loading || listings.length === 0) return;

    const topResults = listings.slice(0, 5).map((l) => ({
      title: l.title,
      type: l.type,
      rating: l.avgRating ? parseFloat(l.avgRating) : undefined,
      price: l.priceAmount ? parseFloat(l.priceAmount) : undefined,
    }));

    fetch("/api/ai/search-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchQuery,
        resultCount: totalCount,
        topResults,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.summary) setAiResultsSummary(d.summary);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSearchActive, loading, listings.length, totalCount]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get("type") || params.get("category");
    const islandParam = params.get("island");
    const qParam = params.get("q");
    const minPriceParam = params.get("minPrice");
    const maxPriceParam = params.get("maxPrice");
    const ratingParam = params.get("minRating");
    const sortParam = params.get("sort");
    if (typeParam) setActiveCategory(typeParam);
    if (islandParam) setActiveIsland(islandParam);
    if (qParam) setSearchQuery(qParam);
    if (minPriceParam) setMinPrice(minPriceParam);
    if (maxPriceParam) setMaxPrice(maxPriceParam);
    if (ratingParam) setMinRating(ratingParam);
    if (sortParam) setSortBy(sortParam);
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
      if (guestCount) params.set("guests", guestCount);
      if (selectedAmenities.length > 0) params.set("amenities", selectedAmenities.join(","));
      if (selectedDuration) params.set("duration", selectedDuration);
      if (freeCancellation) params.set("cancellationPolicy", "flexible");
      if (cuisineType) params.set("cuisineType", cuisineType);
      if (openNow) params.set("openNow", "true");
      if (sortBy !== "recommended") params.set("sort", sortBy);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      try {
        const res = await fetch(`/api/listings?${params}`);
        const data = await res.json();
        const newListings = data.listings || [];
        if (page === 0) {
          setListings(newListings);
          if (searchQuery) analytics.search(searchQuery);
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
  }, [activeCategory, searchQuery, activeIsland, selectedDate, minPrice, maxPrice, minRating, guestCount, selectedAmenities, selectedDuration, freeCancellation, cuisineType, openNow, page, sortBy]);

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
    if (guestCount) countParams.set("guests", guestCount);
    if (selectedAmenities.length > 0) countParams.set("amenities", selectedAmenities.join(","));
    if (selectedDuration) countParams.set("duration", selectedDuration);
    if (freeCancellation) countParams.set("cancellationPolicy", "flexible");
    if (cuisineType) countParams.set("cuisineType", cuisineType);
    if (openNow) countParams.set("openNow", "true");
    fetch(`/api/listings/count?${countParams}`)
      .then((r) => r.json())
      .then((d) => setTotalCount(d.count || 0))
      .catch(() => {});
  }, [activeCategory, searchQuery, activeIsland, selectedDate, minPrice, maxPrice, minRating, guestCount, selectedAmenities, selectedDuration, freeCancellation, cuisineType, openNow, sortBy]);

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        {/* Search Header */}
        <div className="bg-white shadow-sm sticky top-16 z-40">
          <div className="mx-auto max-w-7xl px-4 md:px-6 py-3 md:py-4">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              {/* Search with Autocomplete - full width on mobile */}
              <div className="relative w-full md:w-auto md:flex-1 md:min-w-[20rem] lg:min-w-[28rem]">
                <SearchAutocomplete
                  value={searchQuery}
                  onChange={(val) => {
                    setSearchQuery(val);
                    setAiSearchActive(false);
                    setAiSummary("");
                    setAiSuggestions([]);
                    setAiResultsSummary("");
                    setShowSearchHistory(!val && searchFocused);
                  }}
                  onEnter={(val) => {
                    handleSmartSearch(val);
                    saveSearchHistory(val);
                    setShowSearchHistory(false);
                  }}
                  onFocus={() => {
                    setSearchFocused(true);
                    if (!searchQuery) setShowSearchHistory(true);
                  }}
                  onBlur={() => {
                    setSearchFocused(false);
                    // Delay to allow click on history items
                    setTimeout(() => setShowSearchHistory(false), 200);
                  }}
                  aiSearchLoading={aiSearchLoading}
                  aiSearchActive={aiSearchActive}
                  className="w-full"
                />
                {/* Search History Dropdown */}
                {showSearchHistory && searchHistory.length > 0 && !searchQuery && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-[var(--shadow-elevated)] z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-cream-100">
                      <span className="text-xs font-semibold text-navy-400 uppercase tracking-wide">Recent Searches</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          clearSearchHistory();
                        }}
                        className="flex items-center gap-1 text-xs text-navy-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={11} />
                        Clear History
                      </button>
                    </div>
                    {searchHistory.map((term) => (
                      <button
                        key={term}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchQuery(term);
                          setShowSearchHistory(false);
                          handleSmartSearch(term);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-cream-50 transition-colors text-left"
                      >
                        <History size={14} className="text-navy-300 shrink-0" />
                        <span className="text-sm text-navy-600 truncate">{term}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Date + Island row on mobile */}
              <div className="flex items-center gap-2 bg-cream-50 rounded-xl px-3 py-2 min-w-0 shrink-0">
                <Calendar size={16} className="text-navy-300 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-navy-700 text-sm font-medium outline-none cursor-pointer min-w-[8rem]"
                  min={new Date().toISOString().split("T")[0]}
                  placeholder="Any date"
                />
              </div>
              <select
                value={activeIsland}
                onChange={(e) => setActiveIsland(e.target.value)}
                className="px-4 py-3 rounded-xl bg-cream-50 text-navy-700 text-sm font-medium outline-none appearance-none cursor-pointer hover:bg-cream-100 transition-colors min-w-[7rem]"
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
                <option value="bonaire">🇧🇶 Bonaire</option>
              </select>
              {/* Price Range */}
              <div className="flex items-center gap-1.5 bg-cream-50 rounded-xl px-3 py-2 min-w-0 shrink-0">
                <DollarSign size={16} className="text-navy-300 shrink-0" />
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-16 min-w-[3.5rem] bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                  min="0"
                />
                <span className="text-navy-300 text-sm">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-16 min-w-[3.5rem] bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                  min="0"
                />
              </div>
              {/* Rating Filter */}
              <select
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="px-4 py-3 rounded-xl bg-cream-50 text-navy-700 text-sm font-medium outline-none appearance-none cursor-pointer hover:bg-cream-100 transition-colors min-w-[7rem]"
              >
                <option value="">Any Rating</option>
                <option value="3">3+ Stars</option>
                <option value="4">4+ Stars</option>
                <option value="4.5">4.5+ Stars</option>
              </select>
              {/* Guest Count */}
              <div className="flex items-center gap-1.5 bg-cream-50 rounded-xl px-3 py-2 shrink-0">
                <Users size={16} className="text-navy-300 shrink-0" />
                <button
                  onClick={() => setGuestCount((prev) => {
                    const n = parseInt(prev || "0");
                    return n > 1 ? String(n - 1) : "";
                  })}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-cream-200 transition-colors text-navy-500"
                  aria-label="Decrease guests"
                >
                  <Minus size={12} />
                </button>
                <span className="text-sm font-medium text-navy-700 min-w-[3rem] text-center">
                  {guestCount ? `${guestCount} guest${parseInt(guestCount) !== 1 ? "s" : ""}` : "Guests"}
                </span>
                <button
                  onClick={() => setGuestCount((prev) => {
                    const n = parseInt(prev || "0");
                    return n < 20 ? String(n + 1) : prev;
                  })}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-cream-200 transition-colors text-navy-500"
                  aria-label="Increase guests"
                >
                  <Plus size={12} />
                </button>
              </div>
              {/* View Toggle */}
              <div className="flex items-center bg-cream-50 rounded-xl overflow-hidden shrink-0">
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
            {(activeCategory !== "all" || activeIsland || searchQuery || selectedDate || minPrice || maxPrice || minRating || guestCount || selectedAmenities.length > 0 || selectedDuration || freeCancellation || cuisineType || openNow) && (
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
                {guestCount && (
                  <button
                    onClick={() => setGuestCount("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    {guestCount} Guest{parseInt(guestCount) !== 1 ? "s" : ""}
                    <X size={12} />
                  </button>
                )}
                {selectedAmenities.map((amenity) => (
                  <button
                    key={amenity}
                    onClick={() => setSelectedAmenities((prev) => prev.filter((a) => a !== amenity))}
                    className="flex items-center gap-1 px-3 py-1 bg-teal-600 text-white text-xs font-medium rounded-full hover:bg-teal-500 transition-colors"
                  >
                    {amenityOptions.find((a) => a.id === amenity)?.label || amenity}
                    <X size={12} />
                  </button>
                ))}
                {selectedDuration && (
                  <button
                    onClick={() => setSelectedDuration("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    <Clock size={10} /> {durationOptions.find((d) => d.id === selectedDuration)?.label || selectedDuration}
                    <X size={12} />
                  </button>
                )}
                {freeCancellation && (
                  <button
                    onClick={() => setFreeCancellation(false)}
                    className="flex items-center gap-1 px-3 py-1 bg-teal-600 text-white text-xs font-medium rounded-full hover:bg-teal-500 transition-colors"
                  >
                    Free Cancellation
                    <X size={12} />
                  </button>
                )}
                {cuisineType && (
                  <button
                    onClick={() => setCuisineType("")}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    {cuisineType.charAt(0).toUpperCase() + cuisineType.slice(1)}
                    <X size={12} />
                  </button>
                )}
                {openNow && (
                  <button
                    onClick={() => setOpenNow(false)}
                    className="flex items-center gap-1 px-3 py-1 bg-navy-700 text-white text-xs font-medium rounded-full hover:bg-navy-600 transition-colors"
                  >
                    Open Now
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
                    setGuestCount("");
                    setSelectedAmenities([]);
                    setSelectedDuration("");
                    setFreeCancellation(false);
                    setCuisineType("");
                    setOpenNow(false);
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
                  onClick={() => {
                    setActiveCategory(cat.id);
                    // Clear context-specific filters when switching categories
                    if (cat.id !== "stay") setSelectedAmenities([]);
                    if (cat.id !== "tour" && cat.id !== "excursion") setSelectedDuration("");
                  }}
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

            {/* Amenity Filters — visible when Stays selected */}
            {activeCategory === "stay" && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
                {amenityOptions.map((amenity) => {
                  const isSelected = selectedAmenities.includes(amenity.id);
                  return (
                    <button
                      key={amenity.id}
                      onClick={() =>
                        setSelectedAmenities((prev) =>
                          isSelected
                            ? prev.filter((a) => a !== amenity.id)
                            : [...prev, amenity.id]
                        )
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        isSelected
                          ? "bg-teal-600 text-white shadow-sm"
                          : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                      }`}
                    >
                      <amenity.icon size={13} />
                      {amenity.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Duration Filter — visible when Tours or Excursions selected */}
            {(activeCategory === "tour" || activeCategory === "excursion") && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
                <Clock size={14} className="text-navy-400 shrink-0 mt-1" />
                {durationOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() =>
                      setSelectedDuration((prev) =>
                        prev === opt.id ? "" : opt.id
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      selectedDuration === opt.id
                        ? "bg-teal-600 text-white shadow-sm"
                        : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Cuisine Type + Open Now — visible when Dining selected */}
            {activeCategory === "dining" && (
              <div className="flex items-center gap-3 mt-3 overflow-x-auto pb-1 scrollbar-hide">
                <select
                  value={cuisineType}
                  onChange={(e) => setCuisineType(e.target.value)}
                  className="px-3 py-1.5 rounded-full bg-cream-100 text-navy-500 text-xs font-medium outline-none appearance-none cursor-pointer hover:bg-cream-200 transition-colors min-w-[7rem]"
                >
                  <option value="">All Cuisines</option>
                  {cuisineOptions.map((c) => (
                    <option key={c} value={c.toLowerCase()}>{c}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-all bg-cream-100 hover:bg-cream-200 text-xs font-medium text-navy-500 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={openNow}
                    onChange={(e) => setOpenNow(e.target.checked)}
                    className="w-3.5 h-3.5 accent-teal-500"
                  />
                  <Clock size={13} />
                  Open Now
                </label>
              </div>
            )}

            {/* Free Cancellation Toggle — always visible */}
            <div className="flex items-center gap-3 mt-3">
              <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-all text-xs font-medium whitespace-nowrap ${
                freeCancellation
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-cream-100 text-navy-500 hover:bg-cream-200"
              }`}>
                <input
                  type="checkbox"
                  checked={freeCancellation}
                  onChange={(e) => setFreeCancellation(e.target.checked)}
                  className="sr-only"
                />
                Free Cancellation
              </label>
            </div>
          </div>
        </div>

        {/* AI Search Summary Banner */}
        {aiSearchActive && (aiSummary || aiSuggestions.length > 0) && (
          <div className="mx-auto max-w-7xl px-4 md:px-6 pt-4">
            <div className="bg-gradient-to-r from-gold-50 to-teal-50 rounded-2xl p-4 shadow-sm">
              {aiSummary && (
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-gold-500 shrink-0" />
                  <p className="text-sm font-medium text-navy-700">{aiSummary}</p>
                </div>
              )}
              {aiResultsSummary && (
                <p className="text-sm text-navy-500 ml-6 mb-2">{aiResultsSummary}</p>
              )}
              {aiSuggestions.length > 0 && (
                <div className="flex items-center gap-2 ml-6 flex-wrap">
                  <span className="text-xs text-navy-400 font-medium">Related:</span>
                  {aiSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setSearchQuery("");
                        setActiveCategory("all");
                        setActiveIsland("");
                        setMinPrice("");
                        setMaxPrice("");
                        setMinRating("");
                        setGuestCount("");
                        setSelectedAmenities([]);
                        setSelectedDuration("");
                        setTimeout(() => handleSmartSearch(suggestion), 50);
                      }}
                      className="px-3 py-1 bg-white/70 hover:bg-white text-xs font-medium text-navy-600 rounded-full transition-colors shadow-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="mx-auto max-w-7xl px-6 pt-4 pb-2">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Explore", href: activeCategory !== "all" ? "/explore" : undefined },
              ...(activeCategory !== "all"
                ? [{ label: categoryTabs.find((c) => c.id === activeCategory)?.label || activeCategory }]
                : []),
            ]}
          />
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
                      onClick={() => { setActiveCategory("all"); setSearchQuery(""); setActiveIsland(""); setSelectedDate(""); setMinPrice(""); setMaxPrice(""); setMinRating(""); setGuestCount(""); setSelectedAmenities([]); setSelectedDuration(""); setFreeCancellation(false); setCuisineType(""); setOpenNow(false); }}
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
                <CaribbeanMap listings={listings} activeIsland={activeIsland} onIslandChange={(island) => setActiveIsland(island)} />
              </div>
            </div>
          </div>
        ) : (
          /* ── Grid View ────────────────────────────────────────── */
          <div className="mx-auto max-w-7xl px-6 py-8">
            {/* Recently Viewed — only when not filtering/searching */}
            {activeCategory === "all" && !searchQuery && !activeIsland && !selectedDate && !minPrice && !maxPrice && !minRating && !guestCount && selectedAmenities.length === 0 && !selectedDuration && (
              <RecentlyViewed />
            )}

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
                  onClick={() => { setActiveCategory("all"); setSearchQuery(""); setActiveIsland(""); setSelectedDate(""); setMinPrice(""); setMaxPrice(""); setMinRating(""); setGuestCount(""); setSelectedAmenities([]); setSelectedDuration(""); setFreeCancellation(false); setCuisineType(""); setOpenNow(false); }}
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
