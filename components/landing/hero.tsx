"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, MapPin, ChevronDown, Sparkles } from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";

const heroImages = [
  "/images/hero/caribbean-hero.jpg",
  "/images/islands/grenada.jpg",
  "/images/islands/st-lucia.jpg",
  "/images/islands/jamaica.jpg",
  "/images/islands/barbados.jpg",
];

const TYPE_EMOJI: Record<string, string> = {
  stay: "🏨",
  tour: "🗺️",
  excursion: "🚤",
  dining: "🍽️",
  event: "🎉",
  transport: "🚗",
  transfer: "✈️",
  vip: "💎",
  guide: "🧭",
};

interface AutocompleteResult {
  listings: { title: string; slug: string; island: string; islandSlug: string; type: string }[];
  islands: { name: string; slug: string }[];
}

export function Hero() {
  const [currentImage, setCurrentImage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("");
  const [results, setResults] = useState<AutocompleteResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  useEffect(() => {
    setLoaded(true);
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Autocomplete fetch with debounce
  const fetchAutocomplete = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults(null);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/listings/autocomplete?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setShowDropdown(true);
          setSelectedIndex(-1);
        }
      } catch {}
    }, 200);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    fetchAutocomplete(val);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || !results) return;
    const totalItems = (results.islands?.length || 0) + (results.listings?.length || 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const islandCount = results.islands?.length || 0;
      if (selectedIndex < islandCount) {
        const island = results.islands[selectedIndex];
        router.push(`/${island.slug}`);
      } else {
        const listing = results.listings[selectedIndex - islandCount];
        router.push(`/${listing.islandSlug}/${listing.slug}`);
      }
      setShowDropdown(false);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowDropdown(false);
    const params = new URLSearchParams();
    if (destination) params.set("island", destination);
    if (query) params.set("q", query);
    window.location.href = `/explore?${params}`;
  };

  return (
    <section className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden">
      {/* Rotating background images */}
      {heroImages.map((img, i) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out"
          style={{
            opacity: currentImage === i ? 1 : 0,
            backgroundImage: `url(${img})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ))}

      {/* Cinematic overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/60 via-navy-900/40 to-navy-900/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-900/30 to-transparent" />

      {/* Content */}
      <div
        className={`relative z-10 mx-auto max-w-7xl px-6 text-center transition-all duration-1000 ${
          loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-white/90 border border-white/20 rounded-full px-5 py-2 text-sm font-medium mb-3">
          <span className="w-2 h-2 bg-gold-400 rounded-full animate-pulse" />
          7,200+ listings across 21 Caribbean islands
        </div>
        <div className="mb-8">
          <Link
            href="/trips"
            className="inline-flex items-center gap-2 bg-gold-500/20 backdrop-blur-md text-gold-300 border border-gold-400/30 rounded-full px-5 py-2 text-sm font-medium hover:bg-gold-500/30 transition-all duration-300 group"
          >
            <span className="bg-gold-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">New</span>
            <Sparkles size={14} className="text-gold-400" />
            AI Trip Planner — plan your perfect island getaway
            <span className="group-hover:translate-x-0.5 transition-transform">&rarr;</span>
          </Link>
        </div>

        <h1
          className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.05] tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your Entire Trip.
          <br />
          <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-gold-500 bg-clip-text text-transparent">
            One Platform.
          </span>
        </h1>

        <p className="mt-8 text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed font-light">
          Stays. Tours. Dining. Events. Transport. Guides.
          <br className="hidden md:block" />
          Everything you need for the perfect Caribbean vacation.
        </p>

        {/* Search Bar */}
        <form
          className="mt-8 md:mt-12 mx-auto max-w-6xl"
          onSubmit={handleSubmit}
        >
          <div className="bg-white/[0.07] backdrop-blur-xl rounded-2xl p-2 shadow-[0_8px_60px_rgba(0,0,0,0.3)] border border-white/10">
            <div className="flex flex-col md:flex-row gap-2">
              {/* Destination */}
              <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm">
                <MapPin size={20} className="text-gold-500 shrink-0" />
                <div className="text-left w-full">
                  <label htmlFor="hero-destination" className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider block">
                    Destination
                  </label>
                  <select
                    id="hero-destination"
                    name="destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    aria-label="Select destination island"
                    className="w-full bg-transparent text-navy-700 outline-none text-sm font-medium mt-0.5 appearance-none cursor-pointer"
                  >
                    <option value="">All Caribbean Islands</option>
                    <option value="grenada">{getIslandFlag("grenada")} Grenada</option>
                    <option value="trinidad-and-tobago">{getIslandFlag("trinidad-and-tobago")} Trinidad & Tobago</option>
                    <option value="barbados">{getIslandFlag("barbados")} Barbados</option>
                    <option value="st-lucia">{getIslandFlag("st-lucia")} St. Lucia</option>
                    <option value="jamaica">{getIslandFlag("jamaica")} Jamaica</option>
                    <option value="bahamas">{getIslandFlag("bahamas")} Bahamas</option>
                    <option value="antigua">{getIslandFlag("antigua")} Antigua</option>
                    <option value="aruba">{getIslandFlag("aruba")} Aruba</option>
                    <option value="dominican-republic">{getIslandFlag("dominican-republic")} Dominican Republic</option>
                    <option value="puerto-rico">{getIslandFlag("puerto-rico")} Puerto Rico</option>
                    <option value="curacao">{getIslandFlag("curacao")} Curaçao</option>
                    <option value="cayman-islands">{getIslandFlag("cayman-islands")} Cayman Islands</option>
                    <option value="us-virgin-islands">{getIslandFlag("us-virgin-islands")} USVI</option>
                    <option value="dominica">{getIslandFlag("dominica")} Dominica</option>
                    <option value="st-vincent">{getIslandFlag("st-vincent")} St. Vincent</option>
                    <option value="st-kitts">{getIslandFlag("st-kitts")} St. Kitts</option>
                    <option value="turks-and-caicos">{getIslandFlag("turks-and-caicos")} Turks & Caicos</option>
                    <option value="bonaire">{getIslandFlag("bonaire")} Bonaire</option>
                    <option value="martinique">{getIslandFlag("martinique")} Martinique</option>
                    <option value="guadeloupe">{getIslandFlag("guadeloupe")} Guadeloupe</option>
                    <option value="british-virgin-islands">{getIslandFlag("british-virgin-islands")} BVI</option>
                  </select>
                </div>
              </div>

              {/* Search with autocomplete */}
              <div className="flex-[1.5] relative" ref={searchRef}>
                <div className="flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm h-full">
                  <Search size={20} className="text-gold-500 shrink-0" />
                  <div className="text-left w-full">
                    <label htmlFor="hero-search" className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider block">
                      Search
                    </label>
                    <input
                      id="hero-search"
                      type="text"
                      name="q"
                      value={query}
                      onChange={handleSearchChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => results && setShowDropdown(true)}
                      aria-label="Search listings"
                      placeholder="Hotels, tours, restaurants..."
                      autoComplete="off"
                      className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm font-medium mt-0.5"
                    />
                  </div>
                </div>

                {/* Autocomplete dropdown */}
                {showDropdown && results && (results.listings.length > 0 || results.islands.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-cream-200 overflow-hidden z-50 max-h-80 overflow-y-auto">
                    {/* Island results */}
                    {results.islands.length > 0 && (
                      <div>
                        <div className="px-4 pt-3 pb-1">
                          <span className="text-[10px] font-semibold text-navy-400 uppercase tracking-wider">Islands</span>
                        </div>
                        {results.islands.map((island, i) => (
                          <button
                            key={island.slug}
                            onClick={() => {
                              router.push(`/${island.slug}`);
                              setShowDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gold-50 transition-colors ${
                              selectedIndex === i ? "bg-gold-50" : ""
                            }`}
                          >
                            <span className="text-lg">{getIslandFlag(island.slug)}</span>
                            <div>
                              <span className="text-sm font-medium text-navy-700">{island.name}</span>
                              <span className="block text-[11px] text-navy-400">Explore island</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Listing results */}
                    {results.listings.length > 0 && (
                      <div>
                        <div className="px-4 pt-3 pb-1 border-t border-cream-100">
                          <span className="text-[10px] font-semibold text-navy-400 uppercase tracking-wider">Listings</span>
                        </div>
                        {results.listings.map((listing, i) => {
                          const idx = (results.islands?.length || 0) + i;
                          return (
                            <button
                              key={`${listing.islandSlug}-${listing.slug}`}
                              onClick={() => {
                                router.push(`/${listing.islandSlug}/${listing.slug}`);
                                setShowDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gold-50 transition-colors ${
                                selectedIndex === idx ? "bg-gold-50" : ""
                              }`}
                            >
                              <span className="text-lg">{TYPE_EMOJI[listing.type] || "📍"}</span>
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-medium text-navy-700 line-clamp-1">{listing.title}</span>
                                <span className="block text-[11px] text-navy-400">
                                  {getIslandFlag(listing.islandSlug)} {listing.island}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* View all results */}
                    <button
                      onClick={handleSubmit as any}
                      className="w-full px-4 py-3 text-center text-sm font-medium text-gold-600 hover:bg-gold-50 border-t border-cream-100 transition-colors"
                    >
                      View all results for &ldquo;{query}&rdquo;
                    </button>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                aria-label="Search and explore listings"
                className="bg-gold-500 hover:bg-gold-600 text-white px-10 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] hover:scale-[1.02]"
              >
                <Search size={18} />
                <span className="hidden md:inline">Explore</span>
              </button>
            </div>
          </div>
        </form>

        {/* Stats */}
        <div className="mt-14 flex flex-wrap justify-center gap-12 text-sm">
          {[
            { value: "7,200+", label: "Listings" },
            { value: "21", label: "Islands" },
            { value: "9", label: "Categories" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold text-gold-400">{stat.value}</p>
              <p className="text-white/60 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <ChevronDown size={28} className="text-white/40" />
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {heroImages.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentImage(i)}
            className={`w-2 h-2 rounded-full transition-all duration-500 ${
              currentImage === i
                ? "bg-gold-400 w-6"
                : "bg-white/30 hover:bg-white/50"
            }`}
            aria-label={`Show image ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
