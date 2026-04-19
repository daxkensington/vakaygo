"use client";

import { useEffect, useState } from "react";
import { ListingCard } from "@/components/listings/listing-card";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

type RecommendedListing = {
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
  reason?: string;
};

export function RecommendedListings() {
  const [listings, setListings] = useState<RecommendedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPersonalized, setIsPersonalized] = useState(false);

  useEffect(() => {
    fetch("/api/recommendations")
      .then((r) => r.json())
      .then((data) => {
        setListings(data.recommended || []);
        setIsPersonalized(data.isPersonalized || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-8 w-48 bg-navy-100 rounded-lg animate-pulse" />
          </div>
          <div className="flex gap-5 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="min-w-[280px] h-72 bg-navy-50 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (listings.length === 0) {
    return (
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={20} className="text-gold-700" />
            <h2
              className="text-2xl md:text-3xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Recommended for You
            </h2>
          </div>
          <div className="bg-cream-50 rounded-2xl p-8 text-center">
            <p className="text-navy-400">
              Explore listings to get personalized recommendations.
            </p>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 mt-4 text-gold-700 font-semibold hover:text-gold-700 transition-colors"
            >
              Start Exploring <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between mb-8">
          <div className="flex items-center gap-3">
            <Sparkles size={20} className="text-gold-700" />
            <div>
              <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-1">
                {isPersonalized ? "Personalized" : "Top Picks"}
              </p>
              <h2
                className="text-2xl md:text-3xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Recommended for You
              </h2>
            </div>
          </div>
          <Link
            href="/explore"
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
              className="min-w-[280px] max-w-[300px] snap-start shrink-0"
            >
              <ListingCard {...listing} />
              {listing.reason && (
                <p className="text-xs text-navy-300 mt-2 px-1 truncate">
                  {listing.reason}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="sm:hidden text-center mt-6">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 text-gold-700 font-semibold"
          >
            View all recommendations <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
