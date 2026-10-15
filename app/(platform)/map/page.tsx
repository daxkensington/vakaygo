"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2, Map as MapIcon, ChevronRight } from "lucide-react";
import type { MapListing } from "@/components/listings/caribbean-map";
import { LISTING_TYPES } from "@/lib/listing-filters";

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

type MapLoad = { key: string; status: "loading" | "ready" | "error"; listings: MapListing[] };

function isMapListing(value: unknown): value is MapListing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!["id", "title", "slug", "type", "islandSlug", "islandName"].every(key => typeof row[key] === "string" && row[key] !== "")) return false;
  if (!(LISTING_TYPES as readonly string[]).includes(row.type as string)) return false;
  if (!["priceAmount", "priceUnit", "avgRating", "parish", "image", "latitude", "longitude"].every(key => row[key] === null || typeof row[key] === "string")) return false;
  return (row.reviewCount === null || (typeof row.reviewCount === "number" && Number.isSafeInteger(row.reviewCount) && row.reviewCount >= 0))
    && (row.isFeatured === null || typeof row.isFeatured === "boolean");
}

function hasMapCoordinates(listing: MapListing): boolean {
  if (!listing.latitude || !listing.longitude) return false;
  const latitude = Number(listing.latitude), longitude = Number(listing.longitude);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

export default function MapPage() {
  const [activeIsland, setActiveIsland] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const loadKey = `${activeIsland}|${retryAttempt}`;
  const [load, setLoad] = useState<MapLoad>({ key: loadKey, status: "loading", listings: [] });
  const loading = load.key !== loadKey || load.status === "loading";
  const failed = load.key === loadKey && load.status === "error";
  const listings = load.key === loadKey && load.status === "ready" ? load.listings.filter(hasMapCoordinates) : [];
  const islandName = islands.find(island => island.slug === activeIsland)?.name || "All Islands";

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setLoad({ key: loadKey, status: "loading", listings: [] });
    const timeout = setTimeout(() => {
      if (current) setLoad({ key: loadKey, status: "error", listings: [] });
      controller.abort();
    }, 20_000);
    async function loadListings() {
      try {
        const params = new URLSearchParams({ limit: "1500" });
        if (activeIsland) params.set("island", activeIsland);
        const res = await fetch(`/api/listings?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!current || controller.signal.aborted) return;
        if (!res.ok) throw new Error("Map listings unavailable");
        const data: unknown = await res.json().catch(() => null);
        if (!current || controller.signal.aborted) return;
        if (!data || typeof data !== "object" || Array.isArray(data) || !("listings" in data)
          || !Array.isArray(data.listings) || !data.listings.every(isMapListing)) throw new Error("Invalid map listings response");
        setLoad({ key: loadKey, status: "ready", listings: data.listings });
      } catch {
        if (current) setLoad({ key: loadKey, status: "error", listings: [] });
      } finally {
        clearTimeout(timeout);
      }
    }
    loadListings();
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [activeIsland, loadKey]);

  return (
    <main className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-cream-200">
        <div className="flex items-center gap-2">
          <MapIcon size={18} className="text-gold-700" />
          <h1 className="text-sm font-semibold text-navy-700">Caribbean Map</h1>
          <span className="text-xs text-navy-400" aria-live="polite">
            {loading ? "Loading..." : failed ? "Listings unavailable" : `${listings.length} mapped listings`}
          </span>
        </div>

        {/* Island quick-select */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-[60vw]">
          {islands.map((island) => (
            <button
              key={island.slug}
              aria-pressed={activeIsland === island.slug}
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
      <div className="flex-1 min-h-0" role="region" aria-label={`${islandName} listing map`} aria-busy={loading}>
        {loading ? <div role="status" className="h-full flex items-center justify-center gap-3 bg-cream-50 text-navy-500"><Loader2 aria-hidden="true" className="animate-spin" size={24} />Loading map listings…</div>
          : failed ? <div role="alert" className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center bg-cream-50 text-navy-600"><p>Map listings could not be loaded. Please try again.</p><button type="button" onClick={() => setRetryAttempt(value => value + 1)} className="rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white hover:bg-gold-800">Try loading map listings again</button></div>
          : listings.length === 0 ? <div role="status" className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-cream-50 text-navy-600"><p>No map locations are available for {islandName === "All Islands" ? "these listings" : islandName}.</p><p className="text-sm text-navy-400">Choose another island or explore the listing directory.</p></div>
          : <CaribbeanMap
          listings={listings}
          activeIsland={activeIsland}
          onIslandChange={setActiveIsland}
        />}
      </div>
    </main>
  );
}
