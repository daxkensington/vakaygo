"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { getImageUrl } from "@/lib/image-utils";
import { ImageWithFallback } from "@/components/shared/image-fallback";
import { useCurrency } from "@/lib/currency";

export type FeaturedListing = {
  id: string;
  slug: string;
  title: string;
  type?: string;
  image: string | null;
  parish: string | null;
  priceAmount: string | null;
  priceUnit: string | null;
  avgRating: string | null;
};

export function FeaturedListingsClient({
  islandSlug,
  islandName,
  listings,
}: {
  islandSlug: string;
  islandName: string;
  listings: FeaturedListing[];
}) {
  const { format } = useCurrency();

  if (listings.length === 0) return null;

  return (
    <>
      {(
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {listings.map((listing) => {
        const image = getImageUrl(listing.image, { width: 400 });
        return (
          <Link
            key={listing.id}
            href={`/${islandSlug}/${listing.slug}`}
            className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
          >
            <div className="relative h-44 overflow-hidden">
              <ImageWithFallback
                src={image}
                type={listing.type || "tour"}
                alt={listing.title}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
              />
            </div>
            <div className="p-4">
              <p className="text-xs text-navy-400">{listing.parish || islandName}</p>
              <h3 className="font-semibold text-navy-700 mt-1 line-clamp-1 group-hover:text-gold-600 transition-colors">
                {listing.title}
              </h3>
              <div className="flex items-center justify-between mt-2">
                {listing.priceAmount && parseFloat(listing.priceAmount) > 0 && (
                  <span className="font-bold text-navy-700">
                    {format(parseFloat(listing.priceAmount))}
                    <span className="text-navy-400 text-sm font-normal"> / {listing.priceUnit}</span>
                  </span>
                )}
                {listing.avgRating && parseFloat(listing.avgRating) > 0 && (
                  <div className="flex items-center gap-1">
                    <Star size={12} className="text-gold-700 fill-gold-500" />
                    <span className="text-xs font-semibold">{parseFloat(listing.avgRating).toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
      )}
    </>
  );
}
