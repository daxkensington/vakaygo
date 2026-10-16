"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2, Map as MapIcon, ChevronRight } from "lucide-react";
import type { MapListing } from "@/components/listings/caribbean-map";
import { MAP_PAGE_TIMEOUT_MS, parseMapListingPage } from "@/lib/map-listings";

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
  { slug: "cancun-riviera-maya", name: "Cancún & Riviera Maya" },
  { slug: "los-cabos", name: "Los Cabos" },
  { slug: "cartagena", name: "Cartagena" },
  { slug: "medellin", name: "Medellín" },
  { slug: "guanacaste", name: "Guanacaste" },
  { slug: "ambergris-caye", name: "Ambergris Caye" },
  { slug: "santorini", name: "Santorini" },
  { slug: "mykonos", name: "Mykonos" },
  { slug: "crete", name: "Crete" },
  { slug: "ibiza", name: "Ibiza" },
  { slug: "mallorca", name: "Mallorca" },
  { slug: "amalfi-coast-capri", name: "Amalfi & Capri" },
  { slug: "hvar-split", name: "Hvar & Split" },
];

type MapLoad = { key: string; status: "loading" | "ready" | "error"; listings: MapListing[]; totalCount: number | null };

export default function MapPage() {
  const [activeIsland, setActiveIsland] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const loadKey = `${activeIsland}|${retryAttempt}`;
  const [load, setLoad] = useState<MapLoad>({ key: loadKey, status: "loading", listings: [], totalCount: null });
  const loading = load.key !== loadKey || load.status === "loading";
  const failed = load.key === loadKey && load.status === "error";
  const listings = load.key === loadKey ? load.listings : [];
  const islandName = islands.find(island => island.slug === activeIsland)?.name || "All Islands";

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setLoad({ key: loadKey, status: "loading", listings: [], totalCount: null });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function loadListings() {
      const collected = new Map<string, MapListing>();
      const cursors = new Set<string>();
      let cursor: string | null = null;
      let totalCount: number | null = null;
      try {
        do {
          const params = new URLSearchParams();
          if (activeIsland) params.set("island", activeIsland);
          if (cursor) params.set("cursor", cursor);
          timeout = setTimeout(() => {
            if (current) setLoad({ key: loadKey, status: "error", listings: [...collected.values()], totalCount });
            controller.abort();
          }, MAP_PAGE_TIMEOUT_MS);
          const res = await fetch(`/api/map/listings?${params}`, { signal: controller.signal, cache: "no-store" });
          if (!current || controller.signal.aborted) return;
          if (!res.ok) throw new Error("Map listings unavailable");
          const page = parseMapListingPage(await res.json(), activeIsland);
          clearTimeout(timeout);
          if (!current || controller.signal.aborted) return;
          if (page.totalCount !== null) totalCount = page.totalCount;
          for (const listing of page.listings) collected.set(listing.id, listing);
          cursor = page.nextCursor;
          if (cursor && cursors.has(cursor)) throw new Error("Map paging did not advance");
          if (cursor) cursors.add(cursor);
          setLoad({ key: loadKey, status: cursor ? "loading" : "ready", listings: [...collected.values()], totalCount });
        } while (cursor && current && !controller.signal.aborted);
      } catch {
        if (current && !controller.signal.aborted) setLoad({ key: loadKey, status: "error", listings: [...collected.values()], totalCount });
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
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-cream-200 gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <MapIcon size={18} className="text-gold-700" />
          <h1 className="text-sm font-semibold text-navy-700">Destination Map</h1>
          <span className="text-xs text-navy-400 bg-cream-100 px-2 py-0.5 rounded-full font-medium" aria-live="polite">
            {loading ? (listings.length ? `${listings.length} locations loaded — loading more…` : "Loading...") : failed ? (listings.length ? `${listings.length} locations loaded — more unavailable` : "Listings unavailable") : `${listings.length} mapped listings`}
          </span>
        </div>

        {/* Island quick-select */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-[58vw]">
          {islands.map((island) => (
            <button
              key={island.slug}
              aria-pressed={activeIsland === island.slug}
              onClick={() => setActiveIsland(island.slug)}
              className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                activeIsland === island.slug
                  ? "bg-gold-700 text-white shadow-sm"
                  : "bg-cream-50 text-navy-600 hover:bg-cream-100"
              }`}
            >
              {island.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {activeIsland && (
            <Link
              href={`/${activeIsland}`}
              className="hidden md:flex items-center gap-1 text-xs text-navy-600 hover:text-gold-700 font-medium"
            >
              {islandName} Guide <ChevronRight size={13} />
            </Link>
          )}
          <Link
            href={activeIsland ? `/explore?island=${activeIsland}` : "/explore"}
            className="flex items-center gap-1 text-xs text-gold-700 hover:text-gold-800 font-semibold"
          >
            Explore <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* Full-height map */}
      <div className="relative flex-1 min-h-0" role="region" aria-label={`${islandName} listing map`} aria-busy={loading}>
        {failed && <div role="alert" className={`${listings.length ? "absolute inset-x-4 top-4 z-30 rounded-xl border bg-white p-4 shadow-lg" : "h-full flex flex-col items-center justify-center gap-4 px-6 text-center bg-cream-50"} text-navy-600`}><p>{listings.length ? "Some map locations could not be loaded. The locations already loaded are still available." : "Map listings could not be loaded. Please try again."}</p><button type="button" onClick={() => setRetryAttempt(value => value + 1)} className="mt-2 rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white hover:bg-gold-800">Try loading map listings again</button></div>}
        {listings.length > 0 ? <CaribbeanMap
          listings={listings}
          activeIsland={activeIsland}
          onIslandChange={setActiveIsland}
        /> : loading ? <div role="status" className="h-full flex items-center justify-center gap-3 bg-cream-50 text-navy-500"><Loader2 aria-hidden="true" className="animate-spin" size={24} />Loading map listings…</div>
          : !failed ? <div role="status" className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-cream-50 text-navy-600"><p>No map locations are available for {islandName === "All Islands" ? "these listings" : islandName}.</p><p className="text-sm text-navy-400">Choose another island or explore the listing directory.</p></div> : null}
      </div>
    </main>
  );
}
