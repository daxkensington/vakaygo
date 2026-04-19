"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, X } from "lucide-react";
import { getRecentlyViewed, clearRecentlyViewed, type RecentListing } from "@/lib/recently-viewed";
import { getImageUrl } from "@/lib/image-utils";
import { ImageWithFallback } from "@/components/shared/image-fallback";

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
};

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentListing[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed());
  }, []);

  if (items.length === 0) return null;

  function handleClear() {
    clearRecentlyViewed();
    setItems([]);
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
                {item.priceAmount && parseFloat(item.priceAmount) > 0 && (
                  <p className="text-xs text-navy-500 mt-0.5">
                    <span className="font-bold">${parseFloat(item.priceAmount).toFixed(0)}</span>
                    <span className="text-navy-300"> / {item.priceUnit}</span>
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
