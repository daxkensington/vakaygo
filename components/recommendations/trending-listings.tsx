"use client";

import { useEffect, useState } from "react";
import { ListingCard } from "@/components/listings/listing-card";
import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";

type TrendingListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  headline: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  isFeatured: boolean | null;
  islandSlug: string;
  islandName: string;
  image: string | null;
  viewCount: number;
};

export function TrendingListings() {
  const [listings, setListings] = useState<TrendingListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/listings/trending")
      .then((r) => r.json())
      .then((data) => setListings(data.trending || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-16 bg-cream-50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-8 w-48 bg-navy-100 rounded-lg animate-pulse" />
          </div>
          <div className="flex gap-5 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="min-w-[280px] h-72 bg-white rounded-2xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (listings.length === 0) return null;

  return (
    <section className="py-16 bg-cream-50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center">
              <Flame size={20} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-orange-600 uppercase tracking-widest mb-1">
                Trending
              </p>
              <h2
                className="text-2xl md:text-3xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Popular This Week
              </h2>
            </div>
          </div>
          <Link
            href="/explore?sort=trending"
            className="hidden sm:flex items-center gap-2 text-gold-700 font-semibold hover:text-gold-800 transition-colors"
          >
            View all <ArrowRight size={16} />
          </Link>
        </div>

        {/* Horizontal scroll carousel */}
        <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-6 px-6">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="min-w-[280px] max-w-[300px] snap-start shrink-0 relative"
            >
              <ListingCard {...listing} />
              <div className="absolute top-3 right-14 z-10">
                <span className="inline-flex items-center gap-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  <Flame size={10} />
                  {listing.viewCount} views
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="sm:hidden text-center mt-6">
          <Link
            href="/explore?sort=trending"
            className="inline-flex items-center gap-2 text-gold-700 font-semibold"
          >
            View all trending <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
