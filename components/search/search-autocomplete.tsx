"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Home,
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
  MapPin,
  Loader2,
  Sparkles,
} from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";

type ListingSuggestion = {
  title: string;
  slug: string;
  island: string;
  islandSlug: string;
  type: string;
};

type IslandSuggestion = {
  name: string;
  slug: string;
};

type AutocompleteResult = {
  listings: ListingSuggestion[];
  islands: IslandSuggestion[];
};

const typeIcons: Record<string, typeof Search> = {
  stay: Home,
  tour: Compass,
  excursion: Compass,
  dining: UtensilsCrossed,
  event: Music,
  transport: Car,
  transfer: Car,
  guide: Users,
  vip: Users,
  spa: Sparkles,
};

const typeBadgeColors: Record<string, string> = {
  stay: "bg-gold-100 text-gold-700",
  tour: "bg-teal-100 text-teal-700",
  excursion: "bg-teal-100 text-teal-700",
  dining: "bg-gold-100 text-gold-700",
  event: "bg-teal-100 text-teal-700",
  transport: "bg-navy-100 text-navy-600",
  transfer: "bg-navy-100 text-navy-600",
  guide: "bg-gold-100 text-gold-700",
  vip: "bg-gold-100 text-gold-700",
  spa: "bg-pink-100 text-pink-700",
};

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  aiSearchLoading?: boolean;
  aiSearchActive?: boolean;
  placeholder?: string;
  className?: string;
}

export function SearchAutocomplete({
  value,
  onChange,
  onEnter,
  onFocus,
  onBlur,
  aiSearchLoading,
  aiSearchActive,
  placeholder = 'Search stays, tours, dining, events... or try "romantic dinner in Grenada"',
  className = "",
}: SearchAutocompleteProps) {
  const router = useRouter();
  const [results, setResults] = useState<AutocompleteResult>({
    listings: [],
    islands: [],
  });
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const totalItems =
    results.listings.length +
    results.islands.length +
    (results.islands.length > 0 && results.listings.length > 0 ? 0 : 0);

  const flatItems: Array<
    | { kind: "listing"; data: ListingSuggestion }
    | { kind: "island"; data: IslandSuggestion }
  > = [
    ...results.islands.map(
      (d) => ({ kind: "island" as const, data: d })
    ),
    ...results.listings.map(
      (d) => ({ kind: "listing" as const, data: d })
    ),
  ];

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults({ listings: [], islands: [] });
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/listings/autocomplete?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) return;
      const data: AutocompleteResult = await res.json();
      setResults(data);
      setIsOpen(
        data.listings.length > 0 || data.islands.length > 0
      );
      setActiveIndex(-1);
    } catch {
      setResults({ listings: [], islands: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function navigateToItem(
    item:
      | { kind: "listing"; data: ListingSuggestion }
      | { kind: "island"; data: IslandSuggestion }
  ) {
    setIsOpen(false);
    if (item.kind === "island") {
      router.push(`/islands/${item.data.slug}`);
    } else {
      router.push(
        `/islands/${item.data.islandSlug}/${item.data.slug}`
      );
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || flatItems.length === 0) {
      if (e.key === "Enter" && onEnter && value.trim()) {
        onEnter(value.trim());
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < flatItems.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : flatItems.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < flatItems.length) {
          navigateToItem(flatItems[activeIndex]);
        } else if (onEnter && value.trim()) {
          setIsOpen(false);
          onEnter(value.trim());
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="w-full flex items-center gap-3 bg-cream-50 rounded-xl px-4 py-3">
        {aiSearchLoading ? (
          <Loader2
            size={18}
            className="text-gold-500 shrink-0 animate-spin"
          />
        ) : aiSearchActive ? (
          <Sparkles size={18} className="text-gold-500 shrink-0" />
        ) : (
          <Search size={18} className="text-navy-300 shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            onFocus?.();
            if (
              value.length >= 2 &&
              (results.listings.length > 0 || results.islands.length > 0)
            ) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            onBlur?.();
          }}
          className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `autocomplete-item-${activeIndex}` : undefined
          }
        />
        {aiSearchActive && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gold-700 bg-gold-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            AI-powered
          </span>
        )}
        {loading && value.length >= 2 && (
          <Loader2
            size={14}
            className="text-navy-300 shrink-0 animate-spin"
          />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && flatItems.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-cream-200 overflow-hidden z-50 max-h-80 overflow-y-auto"
          role="listbox"
        >
          {/* Island suggestions */}
          {results.islands.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[11px] font-semibold text-navy-400 uppercase tracking-wider bg-cream-50">
                Islands
              </div>
              {results.islands.map((island, idx) => {
                const flatIdx = idx;
                return (
                  <button
                    key={`island-${island.slug}`}
                    id={`autocomplete-item-${flatIdx}`}
                    role="option"
                    aria-selected={activeIndex === flatIdx}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      activeIndex === flatIdx
                        ? "bg-teal-50"
                        : "hover:bg-cream-50"
                    }`}
                    onClick={() =>
                      navigateToItem({ kind: "island", data: island })
                    }
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <span className="text-base shrink-0">{getIslandFlag(island.slug)}</span>
                    <span className="text-sm font-medium text-navy-700">
                      {island.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Listing suggestions */}
          {results.listings.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[11px] font-semibold text-navy-400 uppercase tracking-wider bg-cream-50">
                Experiences
              </div>
              {results.listings.map((listing, idx) => {
                const flatIdx = results.islands.length + idx;
                const Icon = typeIcons[listing.type] || Search;
                const badgeColor =
                  typeBadgeColors[listing.type] || "bg-cream-100 text-navy-600";
                return (
                  <button
                    key={`listing-${listing.slug}-${idx}`}
                    id={`autocomplete-item-${flatIdx}`}
                    role="option"
                    aria-selected={activeIndex === flatIdx}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      activeIndex === flatIdx
                        ? "bg-teal-50"
                        : "hover:bg-cream-50"
                    }`}
                    onClick={() =>
                      navigateToItem({ kind: "listing", data: listing })
                    }
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <Icon size={16} className="text-navy-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-700 truncate">
                        {listing.title}
                      </p>
                      <p className="text-xs text-navy-400 truncate">
                        {getIslandFlag(listing.islandSlug)} {listing.island}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize ${badgeColor}`}
                    >
                      {listing.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
