"use client";

import { useEffect, useState } from "react";
import { ListingCard } from "@/components/listings/listing-card";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

type Listing = {
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
};

export function FeaturedListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/listings?sort=rating&limit=8")
      .then((r) => r.json())
      .then((data) => setListings(data.listings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-24 bg-white">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      </section>
    );
  }

  if (listings.length === 0) return null;

  return (
    <section className="py-24 md:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-3">
              Top Rated
            </p>
            <h2
              className="text-3xl md:text-4xl font-bold text-navy-700 tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Traveler favorites
            </h2>
          </div>
          <Link
            href="/explore?sort=rating"
            className="hidden sm:flex items-center gap-2 text-gold-700 font-semibold hover:text-gold-800 transition-colors"
          >
            View all <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {listings.map((listing) => (
            <ListingCard key={listing.id} {...listing} />
          ))}
        </div>

        <div className="sm:hidden text-center mt-8">
          <Link
            href="/explore?sort=rating"
            className="inline-flex items-center gap-2 text-gold-700 font-semibold"
          >
            View all top rated <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
