"use client";

import { useEffect, useState } from "react";
import { ListingCard } from "@/components/listings/listing-card";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
    // Defer the fetch (and therefore the thumbnail image loads) until
    // the user interacts or 4 s has passed, so the home LCP budget
    // isn't eaten by an external 100-300 KB listing photo from some
    // random car-rental site's CDN.
    let started = false;
    const controller = new AbortController();
    const go = () => {
      if (started) return;
      started = true;
      window.removeEventListener("scroll", go);
      window.removeEventListener("touchstart", go);
      fetch("/api/listings?sort=rating&limit=4", { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error("Favorites unavailable");
          return r.json();
        })
        .then((data) => {
          if (!controller.signal.aborted && Array.isArray(data.listings)) {
            setListings(data.listings.slice(0, 4));
          }
        })
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    };
    window.addEventListener("scroll", go, { passive: true });
    window.addEventListener("touchstart", go, { passive: true });
    const t = setTimeout(go, 4000);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", go);
      window.removeEventListener("touchstart", go);
      controller.abort();
    };
  }, []);

  return (
    <section className="py-12 md:py-16 bg-white" aria-labelledby="traveler-favorites-title" aria-busy={loading}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-3">
              Top Rated
            </p>
            <h2
              id="traveler-favorites-title"
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
          {loading ? Array.from({ length: 4 }, (_, index) => (
            <div key={index} aria-hidden="true" className="min-h-[21rem] overflow-hidden rounded-2xl bg-cream-50 motion-safe:animate-pulse">
              <div className="h-48 bg-cream-200" />
              <div className="p-4"><div className="h-4 w-2/3 rounded bg-cream-200" /><div className="mt-3 h-5 rounded bg-cream-200" /></div>
            </div>
          )) : listings.map((listing) => (
            <div key={listing.id} className="grid min-h-[21rem]"><ListingCard {...listing} /></div>
          ))}
        </div>

        {loading && <p role="status" className="sr-only">Loading traveler favorites</p>}
        {!loading && listings.length === 0 && <p className="text-sm text-navy-500">Browse the directory to discover local places.</p>}

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
