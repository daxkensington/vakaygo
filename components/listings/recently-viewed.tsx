"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, X, Home, Compass, UtensilsCrossed, Music, Car, Users } from "lucide-react";
import { getRecentlyViewed, clearRecentlyViewed, type RecentListing } from "@/lib/recently-viewed";
import { getImageUrl } from "@/lib/image-utils";

const typeConfig: Record<string, { color: string; bg: string; icon: typeof Home; label: string }> = {
  stay: { color: "text-gold-800", bg: "bg-gold-50", icon: Home, label: "Stay" },
  tour: { color: "text-teal-800", bg: "bg-teal-50", icon: Compass, label: "Tour" },
  excursion: { color: "text-teal-800", bg: "bg-teal-50", icon: Compass, label: "Excursion" },
  dining: { color: "text-gold-800", bg: "bg-gold-50", icon: UtensilsCrossed, label: "Dining" },
  event: { color: "text-teal-800", bg: "bg-teal-50", icon: Music, label: "Event" },
  transport: { color: "text-navy-700", bg: "bg-navy-50", icon: Car, label: "Transport" },
  transfer: { color: "text-navy-700", bg: "bg-navy-50", icon: Car, label: "Transfer" },
  vip: { color: "text-gold-800", bg: "bg-gold-50", icon: Users, label: "VIP" },
  guide: { color: "text-gold-800", bg: "bg-gold-50", icon: Users, label: "Guide" },
};

const typeFallbacks: Record<string, string> = {
  stay: "from-gold-400 to-gold-600",
  tour: "from-teal-400 to-teal-600",
  excursion: "from-teal-500 to-teal-700",
  dining: "from-gold-500 to-gold-700",
  event: "from-teal-500 to-teal-700",
  transport: "from-navy-400 to-navy-600",
  transfer: "from-navy-500 to-navy-700",
  vip: "from-gold-500 to-gold-700",
  guide: "from-gold-400 to-teal-500",
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
          const TypeIcon = config.icon;
          const fallback = typeFallbacks[item.type] || "from-navy-400 to-navy-600";

          return (
            <Link
              key={item.id}
              href={`/${item.islandSlug}/${item.slug}`}
              className="group flex-shrink-0 w-[180px] snap-start bg-white rounded-xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="relative h-24 overflow-hidden">
                {item.image ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                    style={{ backgroundImage: `url(${getImageUrl(item.image) || item.image})` }}
                  />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${fallback} flex items-center justify-center`}>
                    <TypeIcon size={24} className="text-white/30" />
                  </div>
                )}
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
