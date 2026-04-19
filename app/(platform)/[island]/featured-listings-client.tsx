"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { getImageUrl } from "@/lib/image-utils";

export type FeaturedListing = {
  id: string;
  slug: string;
  title: string;
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Defer until after LCP so the below-fold grid (external listing
    // images are often 500-600 KB) doesn't eat the mobile LCP budget.
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void) => number;
    }).requestIdleCallback;
    if (ric) ric(() => setMounted(true));
    else setTimeout(() => setMounted(true), 200);
  }, []);

  if (!mounted || listings.length === 0) return null;

  return (
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
              {image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={image}
                  alt={listing.title}
                  loading="lazy"
                  decoding="async"
                  width={800}
                  height={600}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div className="absolute inset-0 bg-cream-200" />
              )}
            </div>
            <div className="p-4">
              <p className="text-xs text-navy-400">{listing.parish || islandName}</p>
              <h3 className="font-semibold text-navy-700 mt-1 line-clamp-1 group-hover:text-gold-600 transition-colors">
                {listing.title}
              </h3>
              <div className="flex items-center justify-between mt-2">
                {listing.priceAmount && (
                  <span className="font-bold text-navy-700">
                    ${parseFloat(listing.priceAmount).toFixed(0)}
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
  );
}
