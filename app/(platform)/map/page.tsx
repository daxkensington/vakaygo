"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2, Map as MapIcon, ChevronRight } from "lucide-react";
import type { MapListing } from "@/components/listings/caribbean-map";

const CaribbeanMap = dynamic(() => import("@/components/listings/caribbean-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-navy-900 flex items-center justify-center">
      <Loader2 className="animate-spin text-gold-400" size={40} />
    </div>
  ),
});

const islands = [
  { slug: "", name: "All Islands" },
  { slug: "grenada", name: "Grenada" },
  { slug: "trinidad-and-tobago", name: "Trinidad & Tobago" },
  { slug: "barbados", name: "Barbados" },
  { slug: "st-lucia", name: "St. Lucia" },
  { slug: "jamaica", name: "Jamaica" },
  { slug: "bahamas", name: "Bahamas" },
  { slug: "antigua", name: "Antigua" },
  { slug: "aruba", name: "Aruba" },
  { slug: "dominican-republic", name: "Dominican Republic" },
  { slug: "puerto-rico", name: "Puerto Rico" },
  { slug: "curacao", name: "Curaçao" },
  { slug: "cayman-islands", name: "Cayman Islands" },
  { slug: "us-virgin-islands", name: "USVI" },
  { slug: "dominica", name: "Dominica" },
  { slug: "st-vincent", name: "St. Vincent" },
  { slug: "st-kitts", name: "St. Kitts" },
  { slug: "turks-and-caicos", name: "Turks & Caicos" },
  { slug: "bonaire", name: "Bonaire" },
  { slug: "martinique", name: "Martinique" },
  { slug: "guadeloupe", name: "Guadeloupe" },
  { slug: "british-virgin-islands", name: "BVI" },
];

export default function MapPage() {
  const [listings, setListings] = useState<MapListing[]>([]);
  const [activeIsland, setActiveIsland] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadListings() {
      try {
        // Initial paint loads 500. 2000 was a 1.5-2 MB JSON blob and
        // ~1.3s TBT for no visible benefit (most pins overlap at default
        // zoom). Refilter via the island chips to drill in further.
        const params = new URLSearchParams({ limit: "500" });
        if (activeIsland) params.set("island", activeIsland);
        const res = await fetch(`/api/listings?${params}`);
        if (res.ok) {
          const data = await res.json();
          setListings(data.listings || []);
        }
      } catch (e) {
        console.error("Failed to load listings for map:", e);
      } finally {
        setLoading(false);
      }
    }
    loadListings();
  }, [activeIsland]);

  return (
    <main className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-cream-200">
        <div className="flex items-center gap-2">
          <MapIcon size={18} className="text-gold-500" />
          <h1 className="text-sm font-semibold text-navy-700">Caribbean Map</h1>
          <span className="text-xs text-navy-400">
            {loading ? "Loading..." : `${listings.filter(l => l.latitude).length} listings`}
          </span>
        </div>

        {/* Island quick-select */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-[60vw]">
          {islands.map((island) => (
            <button
              key={island.slug}
              onClick={() => setActiveIsland(island.slug)}
              className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                activeIsland === island.slug
                  ? "bg-gold-700 text-white"
                  : "bg-cream-50 text-navy-600 hover:bg-cream-100"
              }`}
            >
              {island.name}
            </button>
          ))}
        </div>

        <Link
          href="/explore"
          className="flex items-center gap-1 text-xs text-gold-700 hover:text-gold-700 font-medium"
        >
          Explore <ChevronRight size={14} />
        </Link>
      </div>

      {/* Full-height map */}
      <div className="flex-1">
        <CaribbeanMap
          listings={listings}
          activeIsland={activeIsland}
          onIslandChange={setActiveIsland}
        />
      </div>
    </main>
  );
}
