"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, MapPin, ChevronDown } from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";
import { LISTING_TYPES } from "@/lib/listing-filters";
import { parseAutocompleteResults, type AutocompleteResult } from "@/lib/autocomplete-results";

const heroImages = [
  "/images/hero/caribbean-hero.jpg",
  "/images/islands/grenada.jpg",
  "/images/islands/santorini.jpg",
  "/images/islands/cartagena.jpg",
  "/images/islands/st-lucia.jpg",
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
  spa: "✨",
};

export function Hero() {
  const [currentImage, setCurrentImage] = useState(0);
  const [mountRotation, setMountRotation] = useState(false);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("");
  const [results, setResults] = useState<AutocompleteResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const listboxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const hasSuggestions = !!results && results.islands.length + results.listings.length > 0;
  const dropdownOpen = showDropdown && hasSuggestions;

  const dismissSuggestions = useCallback(() => {
    requestVersion.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
    setShowDropdown(false);
    setSelectedIndex(-1);
  }, []);

  useEffect(() => () => {
    requestVersion.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!dropdownOpen || selectedIndex < 0) return;
    const listbox = listboxRef.current;
    const option = document.getElementById(`hero-option-${selectedIndex}`);
    if (!listbox || !option) return;
    const bounds = listbox.getBoundingClientRect();
    const selected = option.getBoundingClientRect();
    if (selected.bottom > bounds.bottom) listbox.scrollTop += selected.bottom - bounds.bottom;
    else if (selected.top < bounds.top) listbox.scrollTop -= bounds.top - selected.top;
  }, [dropdownOpen, selectedIndex]);

  useEffect(() => {
    // Crossfading full-viewport images every 6s from t=4s kept the page
    // visually "unfinished" for the whole load window (Speed Index 18.7s
    // on mobile) and burns battery. Start later, rotate slower, and
    // don't animate at all for people who asked for reduced motion or
    // when the tab is hidden.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mountTimer = setTimeout(() => setMountRotation(true), 9000);
    const interval = setInterval(() => {
      if (document.hidden) return;
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
    }, 9000);
    return () => {
      clearTimeout(mountTimer);
      clearInterval(interval);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        dismissSuggestions();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dismissSuggestions]);

  // Autocomplete fetch with debounce
  const fetchAutocomplete = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
    const version = ++requestVersion.current;
    setResults(null);
    setShowDropdown(false);
    setSelectedIndex(-1);
    const search = q.trim();
    if (search.length < 2) return;
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      requestRef.current = controller;
      try {
        const res = await fetch(`/api/listings/autocomplete?q=${encodeURIComponent(search)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = parseAutocompleteResults(await res.json());
        if (!controller.signal.aborted && version === requestVersion.current && data) {
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
    if (e.key === "Escape") {
      e.preventDefault();
      dismissSuggestions();
      return;
    }
    if (!dropdownOpen || !results) return;
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
      dismissSuggestions();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dismissSuggestions();
    const params = new URLSearchParams();
    if (destination) params.set("island", destination);
    if (query.trim()) params.set("q", query.trim());
    router.push(`/explore${params.size ? `?${params}` : ""}`);
  };

  return (
    <section className="relative min-h-[max(700px,100svh)] flex items-center justify-center py-24">
      {/* Rotating background images — first is the LCP candidate; the
          rest are deferred until after LCP so they don't compete for
          bandwidth on slow networks. */}
      {heroImages.map((img, i) => {
        if (i !== 0 && !mountRotation) return null;
        return (
          <div
            key={img}
            className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out"
            style={{ opacity: currentImage === i ? 1 : 0 }}
            aria-hidden={currentImage !== i}
          >
            <Image
              src={img}
              alt=""
              fill
              priority={i === 0}
              fetchPriority={i === 0 ? "high" : "auto"}
              loading={i === 0 ? "eager" : "lazy"}
              sizes="100vw"
              quality={80}
              className="object-cover object-center"
            />
          </div>
        );
      })}

      {/* Cinematic overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/60 via-navy-900/40 to-navy-900/90 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-900/30 to-transparent pointer-events-none" />

      {/* Content — intentionally not opacity-0 at first paint. The
          fade-in used to be opacity-0 until a client useEffect flipped
          `loaded`, but that forced Lighthouse to skip the <h1> as an
          LCP candidate until hydration, pushing LCP ~1.5s past FCP for
          no visual gain. Rendering at full opacity on SSR lets the
          giant "Your Entire Trip" headline count as LCP immediately. */}
      <div
        className="relative z-10 mx-auto w-full max-w-7xl px-6 text-center"
      >
        <div className="inline-flex items-center gap-2 bg-white/20 md:bg-white/10 md:backdrop-blur-md text-white/90 border border-white/20 rounded-full px-5 py-2 text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-gold-400 rounded-full animate-pulse" />
          8,000+ listings across 34 Caribbean, LatAm &amp; Mediterranean destinations
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

        <p className="mt-8 text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
          Stays. Boat Charters. Tours. Dining. Transfers. Concierge.{" "}
          <br className="hidden md:block" />
          Discover local places and plan your trip. Booking options depend on verification, setup, and availability for each listing.
        </p>

        {/* Search Bar */}
        <form
          className="mt-8 md:mt-12 mx-auto max-w-6xl"
          action="/explore"
          method="get"
          onSubmit={handleSubmit}
        >
          <div className="bg-navy-900/30 md:bg-white/[0.07] md:backdrop-blur-xl rounded-2xl p-2 shadow-[0_8px_60px_rgba(0,0,0,0.3)] border border-white/10">
            <div className="flex flex-col md:flex-row gap-2">
              {/* Destination */}
              <div className="flex-[1.2] min-w-0 flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm">
                <MapPin size={20} className="text-gold-700 shrink-0" />
                <div className="text-left w-full min-w-0">
                  <label htmlFor="hero-destination" className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider block">
                    Destination
                  </label>
                  <select
                    id="hero-destination"
                    name="island"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    aria-label="Select destination island"
                    className="w-full bg-transparent text-navy-700 text-sm font-medium mt-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-gold-700 rounded"
                  >
                    <option value="">All 34 Destinations</option>
                    <optgroup label="Caribbean Islands">
                      <option value="grenada">{getIslandFlag("grenada")} Grenada</option>
                      <option value="trinidad-and-tobago">{getIslandFlag("trinidad-and-tobago")} Trinidad &amp; Tobago</option>
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
                      <option value="turks-and-caicos">{getIslandFlag("turks-and-caicos")} Turks &amp; Caicos</option>
                      <option value="bonaire">{getIslandFlag("bonaire")} Bonaire</option>
                      <option value="martinique">{getIslandFlag("martinique")} Martinique</option>
                      <option value="guadeloupe">{getIslandFlag("guadeloupe")} Guadeloupe</option>
                      <option value="british-virgin-islands">{getIslandFlag("british-virgin-islands")} BVI</option>
                    </optgroup>
                    <optgroup label="Latin America & Central America">
                      <option value="cancun-riviera-maya">{getIslandFlag("cancun-riviera-maya")} Cancún &amp; Riviera Maya</option>
                      <option value="los-cabos">{getIslandFlag("los-cabos")} Los Cabos</option>
                      <option value="cartagena">{getIslandFlag("cartagena")} Cartagena</option>
                      <option value="medellin">{getIslandFlag("medellin")} Medellín &amp; Guatapé</option>
                      <option value="guanacaste">{getIslandFlag("guanacaste")} Guanacaste, Costa Rica</option>
                      <option value="ambergris-caye">{getIslandFlag("ambergris-caye")} Ambergris Caye, Belize</option>
                    </optgroup>
                    <optgroup label="Mediterranean Islands & Coasts">
                      <option value="santorini">{getIslandFlag("santorini")} Santorini, Greece</option>
                      <option value="mykonos">{getIslandFlag("mykonos")} Mykonos, Greece</option>
                      <option value="crete">{getIslandFlag("crete")} Crete, Greece</option>
                      <option value="ibiza">{getIslandFlag("ibiza")} Ibiza &amp; Formentera</option>
                      <option value="mallorca">{getIslandFlag("mallorca")} Mallorca, Spain</option>
                      <option value="amalfi-coast-capri">{getIslandFlag("amalfi-coast-capri")} Amalfi Coast &amp; Capri</option>
                      <option value="hvar-split">{getIslandFlag("hvar-split")} Hvar &amp; Split, Croatia</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Search with autocomplete */}
              <div className="flex-[1.5] min-w-0 relative" ref={searchRef} onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dismissSuggestions();
              }}>
                <div className="flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm h-full">
                  <Search size={20} className="text-gold-700 shrink-0" />
                  <div className="text-left w-full min-w-0">
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
                      onFocus={() => results ? setShowDropdown(true) : fetchAutocomplete(query)}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={dropdownOpen}
                      aria-controls={dropdownOpen ? "hero-suggestions" : undefined}
                      aria-activedescendant={dropdownOpen && selectedIndex >= 0 ? `hero-option-${selectedIndex}` : undefined}
                      aria-label="Search listings"
                      placeholder="Hotels, tours, restaurants..."
                      autoComplete="off"
                      className="w-full bg-transparent text-navy-700 placeholder:text-navy-400 text-sm font-medium mt-0.5 focus-visible:outline-2 focus-visible:outline-gold-700 rounded"
                    />
                  </div>
                </div>

                {/* Autocomplete dropdown */}
                {dropdownOpen && results && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-cream-200 overflow-hidden z-50">
                    <div id="hero-suggestions" role="listbox" aria-label="Search suggestions" ref={listboxRef} className="max-h-64 overflow-y-auto">
                    {/* Island results */}
                    {results.islands.length > 0 && (
                      <div role="group" aria-label="Islands">
                        <div className="px-4 pt-3 pb-1">
                          <span className="text-[10px] font-semibold text-navy-400 uppercase tracking-wider">Islands</span>
                        </div>
                        {results.islands.map((island, i) => (
                          <button
                            type="button"
                            role="option"
                            id={`hero-option-${i}`}
                            aria-selected={selectedIndex === i}
                            tabIndex={-1}
                            onMouseDown={(event) => event.preventDefault()}
                            key={island.slug}
                            onClick={() => {
                              router.push(`/${island.slug}`);
                              dismissSuggestions();
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
                      <div role="group" aria-label="Listings">
                        <div className="px-4 pt-3 pb-1 border-t border-cream-100">
                          <span className="text-[10px] font-semibold text-navy-400 uppercase tracking-wider">Listings</span>
                        </div>
                        {results.listings.map((listing, i) => {
                          const idx = (results.islands?.length || 0) + i;
                          return (
                            <button
                              type="button"
                              role="option"
                              id={`hero-option-${idx}`}
                              aria-selected={selectedIndex === idx}
                              tabIndex={-1}
                              onMouseDown={(event) => event.preventDefault()}
                              key={`${listing.islandSlug}-${listing.slug}`}
                              onClick={() => {
                                router.push(`/${listing.islandSlug}/${listing.slug}`);
                                dismissSuggestions();
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

                    </div>
                    {/* View all results */}
                    <button
                      type="button"
                      onClick={(event) => handleSubmit(event)}
                      className="w-full px-4 py-3 text-center text-sm font-medium text-gold-700 hover:bg-gold-50 border-t border-cream-100 transition-colors"
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
                className="bg-gold-700 hover:bg-gold-800 text-white px-10 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] hover:scale-[1.02]"
              >
                <Search size={18} />
                <span className="inline">Explore</span>
              </button>
            </div>
          </div>
        </form>

        {/* Quick Discovery Pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 text-xs">
          <Link prefetch={false}
            href="/trips/new"
            className="inline-flex items-center gap-1.5 bg-gold-500/90 hover:bg-gold-500 text-navy-900 font-bold px-4 py-2 rounded-full shadow-lg transition-all duration-200 hover:scale-105"
          >
            ✨ AI Trip Planner
          </Link>
          <Link prefetch={false}
            href="/map"
            className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-md text-white font-semibold px-4 py-2 rounded-full border border-white/25 transition-all duration-200"
          >
            🗺️ 3D Interactive Map
          </Link>
          <Link prefetch={false}
            href="/explore?type=stay"
            className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/90 font-medium px-3.5 py-2 rounded-full border border-white/15 transition-all duration-200"
          >
            🏨 Boutique Stays
          </Link>
          <Link prefetch={false}
            href="/explore?type=excursion"
            className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/90 font-medium px-3.5 py-2 rounded-full border border-white/15 transition-all duration-200"
          >
            🚤 Boat &amp; Snorkel Excursions
          </Link>
          <Link prefetch={false}
            href="/explore?type=dining"
            className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white/90 font-medium px-3.5 py-2 rounded-full border border-white/15 transition-all duration-200"
          >
            🍽️ Waterfront Dining
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-10 flex flex-wrap justify-center gap-12 text-sm">
          {[
            { value: "8,000+", label: "Listings" },
            { value: "34", label: "Destinations" },
            { value: String(LISTING_TYPES.length), label: "Categories" },
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

      {/* Dot indicators — visual dot is small but the button itself is
          a 24px touch target so axe target-size passes */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 flex gap-1">
        {heroImages.map((_, i) => (
          <button
            key={i}
            onClick={() => { setMountRotation(true); setCurrentImage(i); }}
            aria-pressed={currentImage === i}
            className="p-2 group"
            aria-label={`Show image ${i + 1}`}
          >
            <span
              className={`block h-2 rounded-full transition-all duration-500 ${
                currentImage === i
                  ? "bg-gold-400 w-6"
                  : "bg-white/30 group-hover:bg-white/50 w-2"
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
