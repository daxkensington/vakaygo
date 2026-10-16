"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, X } from "lucide-react";
import { getRecentlyViewed, clearRecentlyViewed, type RecentListing } from "@/lib/recently-viewed";
import { getImageUrl } from "@/lib/image-utils";
import { ImageWithFallback } from "@/components/shared/image-fallback";
import { useCurrency } from "@/lib/currency";

type CurrentPrice = { id: string; priceAmount: string | null; priceCurrency: string | null; priceUnit: string | null; bookingEligible: boolean };

const typeConfig: Record<string, { color: string; bg: string; label: string }> = {
  stay: { color: "text-gold-800", bg: "bg-gold-50", label: "Stay" },
  tour: { color: "text-teal-800", bg: "bg-teal-50", label: "Tour" },
  excursion: { color: "text-teal-800", bg: "bg-teal-50", label: "Excursion" },
  dining: { color: "text-gold-800", bg: "bg-gold-50", label: "Dining" },
  event: { color: "text-teal-800", bg: "bg-teal-50", label: "Event" },
  transport: { color: "text-navy-700", bg: "bg-navy-50", label: "Transport" },
  transfer: { color: "text-navy-700", bg: "bg-navy-50", label: "Transfer" },
  vip: { color: "text-gold-800", bg: "bg-gold-50", label: "VIP" },
  guide: { color: "text-gold-800", bg: "bg-gold-50", label: "Guide" },
  spa: { color: "text-pink-800", bg: "bg-pink-50", label: "Spa & Wellness" },
};

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentListing[]>([]);
  const [prices, setPrices] = useState<Record<string, CurrentPrice>>({});
  const { format } = useCurrency();

  useEffect(() => {
    setItems(getRecentlyViewed());
  }, []);

  useEffect(() => {
    if (!items.length) return;
    let current = true;
    let controller: AbortController | undefined;
    async function refreshPrices() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setPrices({});
      if (document.visibilityState === "hidden") return;
      const timeout = setTimeout(() => request.abort(), 10_000);
      try {
        const params = new URLSearchParams({ ids: items.map(item => item.id).join(",") });
        const response = await fetch(`/api/listings/preview-prices?${params}`, { cache: "no-store", signal: request.signal });
        const data = await response.json();
        if (!current || request.signal.aborted || !response.ok || !Array.isArray(data.listings)) return;
        const fresh: Record<string, CurrentPrice> = {};
        for (const row of data.listings) {
          if (!row || typeof row.id !== "string" || !items.some(item => item.id === row.id)
            || typeof row.bookingEligible !== "boolean"
            || !(row.priceAmount === null || (typeof row.priceAmount === "string" && Number.isFinite(Number(row.priceAmount))))
            || !(row.priceCurrency === null || (typeof row.priceCurrency === "string" && /^[A-Z]{3}$/.test(row.priceCurrency)))
            || !(row.priceUnit === null || typeof row.priceUnit === "string")) continue;
          fresh[row.id] = row;
        }
        setPrices(fresh);
      } catch {
        // History remains useful when a fresh price cannot be confirmed.
      } finally { clearTimeout(timeout); }
    }
    void refreshPrices();
    const refresh = () => { void refreshPrices(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      current = false; controller?.abort(); window.clearInterval(interval);
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [items]);

  if (items.length === 0) return null;

  function handleClear() {
    clearRecentlyViewed();
    setItems([]);
    setPrices({});
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-navy-400" />
          <h3 className="text-sm font-semibold text-navy-600">Recently Viewed</h3>
        </div>
        <button
          onClick={handleClear}
          className="flex items-center gap-1 text-xs text-navy-400 hover:text-red-500 transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        {items.map((item) => {
          const config = typeConfig[item.type] || typeConfig.tour;
          const price = prices[item.id];

          return (
            <Link
              key={item.id}
              href={`/${item.islandSlug}/${item.slug}`}
              className="group flex-shrink-0 w-[180px] snap-start bg-white rounded-xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="relative h-24 overflow-hidden">
                <ImageWithFallback
                  src={getImageUrl(item.image, { width: 400 })}
                  type={item.type}
                  className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                  iconSize={24}
                />
                <div className="absolute top-2 left-2">
                  <span className={`${config.bg} ${config.color} text-[10px] font-semibold px-2 py-0.5 rounded-full`}>
                    {config.label}
                  </span>
                </div>
              </div>
              <div className="p-2.5">
                <h4 className="text-xs font-semibold text-navy-700 line-clamp-1 group-hover:text-gold-600 transition-colors">
                  {item.title}
                </h4>
                {price?.bookingEligible === true && price.priceAmount && price.priceCurrency && parseFloat(price.priceAmount) > 0 && (
                  <p className="text-xs text-navy-500 mt-0.5">
                    <span className="font-bold">{format(parseFloat(price.priceAmount), price.priceCurrency)}</span>
                    {price.priceUnit && <span className="text-navy-300"> / {price.priceUnit}</span>}
                  </p>
                )}
                {price?.bookingEligible === false && <p className="text-xs text-navy-400 mt-0.5">Information only</p>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
