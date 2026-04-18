"use client";

import Link from "next/link";
import { Star, MapPin } from "lucide-react";
import { useSaved } from "@/lib/use-saved";
import { useCurrency } from "@/lib/currency";
import { getImageUrl } from "@/lib/image-utils";
import { ImageWithFallback } from "@/components/shared/image-fallback";
import { getIslandFlag } from "@/lib/island-flags";
import { SuperhostBadge } from "@/components/shared/superhost-badge";

type ListingCardProps = {
  id: string;
  title: string;
  slug: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  islandSlug: string;
  islandName: string;
  image: string | null;
  isFeatured: boolean | null;
  operatorSuperhost?: boolean;
};

const typeConfig: Record<string, { color: string; bg: string }> = {
  stay: { color: "text-gold-800", bg: "bg-gold-50" },
  tour: { color: "text-teal-800", bg: "bg-teal-50" },
  excursion: { color: "text-teal-800", bg: "bg-teal-50" },
  dining: { color: "text-gold-800", bg: "bg-gold-50" },
  event: { color: "text-teal-800", bg: "bg-teal-50" },
  transport: { color: "text-navy-700", bg: "bg-navy-50" },
  transfer: { color: "text-navy-700", bg: "bg-navy-50" },
  vip: { color: "text-gold-800", bg: "bg-gold-50" },
  guide: { color: "text-gold-800", bg: "bg-gold-50" },
  spa: { color: "text-pink-800", bg: "bg-pink-50" },
};

const typeLabels: Record<string, string> = {
  stay: "Stay",
  tour: "Tour",
  excursion: "Excursion",
  dining: "Dining",
  event: "Event",
  transport: "Transport",
  transfer: "Transfer",
  vip: "VIP",
  guide: "Guide",
  spa: "Spa & Wellness",
};


export function ListingCard(props: ListingCardProps) {
  const config = typeConfig[props.type] || typeConfig.tour;
  const rating = props.avgRating ? parseFloat(props.avgRating) : 0;
  const { isSaved, toggle } = useSaved();
  const { format } = useCurrency();
  const saved = isSaved(props.id);
  const imageUrl = getImageUrl(props.image);

  return (
    <Link
      href={`/${props.islandSlug}/${props.slug}`}
      className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
      itemScope
      itemType="https://schema.org/Product"
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <ImageWithFallback
          src={imageUrl}
          type={props.type}
          alt={props.title}
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
        />

        {/* Type badge */}
        <div className="absolute top-3 left-3">
          <span className={`${config.bg} ${config.color} text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm`}>
            {typeLabels[props.type] || props.type}
          </span>
        </div>

        {/* Featured badge */}
        {props.isFeatured && (
          <div className="absolute top-3 right-3">
            <span className="bg-gold-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              Featured
            </span>
          </div>
        )}

        {/* Save button */}
        <button
          aria-label={saved ? "Unsave listing" : "Save listing"}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(props.id); }}
          className="absolute bottom-3 right-3 w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className={saved ? "text-red-500" : "text-navy-600"}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-navy-400 flex items-center gap-1 truncate">
            <MapPin size={10} className="shrink-0" />
            {props.parish ? `${props.parish}, ` : ""}{getIslandFlag(props.islandSlug)} {props.islandName}
          </p>
          {rating > 0 && (
            <div
              className="flex items-center gap-1 shrink-0 ml-2"
              itemProp="aggregateRating"
              itemScope
              itemType="https://schema.org/AggregateRating"
            >
              <Star size={12} className="text-gold-500 fill-gold-500" />
              <span className="text-xs font-semibold text-navy-700" itemProp="ratingValue">
                {rating.toFixed(1)}
              </span>
              <meta itemProp="bestRating" content="5" />
              {props.reviewCount && props.reviewCount > 0 && (
                <span className="text-xs text-navy-300">
                  (<span itemProp="reviewCount">{props.reviewCount}</span>)
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-navy-700 leading-snug line-clamp-2 group-hover:text-gold-600 transition-colors flex-1" itemProp="name">
            {props.title}
          </h3>
          {props.operatorSuperhost && <SuperhostBadge variant="card" />}
        </div>
        {props.priceAmount && parseFloat(props.priceAmount) > 0 && (
          <p className="mt-2" itemProp="offers" itemScope itemType="https://schema.org/Offer">
            <span className="font-bold text-navy-700" itemProp="price" content={props.priceAmount}>
              {format(parseFloat(props.priceAmount))}
            </span>
            <span className="text-navy-400 text-sm"> / {props.priceUnit}</span>
            <meta itemProp="priceCurrency" content="XCD" />
          </p>
        )}
      </div>
    </Link>
  );
}
