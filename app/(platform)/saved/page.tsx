"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ListingCard } from "@/components/listings/listing-card";
import { useAuth } from "@/lib/auth-context";
import { useSaved } from "@/lib/use-saved";
import { Heart, Loader2, X } from "lucide-react";
import Link from "next/link";

type SavedListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  isFeatured: boolean | null;
  islandSlug: string;
  islandName: string;
};

export default function SavedPage() {
  const { user, loading: authLoading } = useAuth();
  const { toggle } = useSaved();
  const [saved, setSaved] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSaved() {
      try {
        const res = await fetch("/api/saved");
        if (!res.ok) return;
        const data = await res.json();
        setSaved(data.saved || []);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchSaved();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading]);

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex items-center gap-3">
            <h1
              className="text-3xl md:text-4xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Saved Listings
            </h1>
            {user && !loading && saved.length > 0 && (
              <span className="bg-gold-100 text-gold-700 text-sm font-semibold px-3 py-1 rounded-full">
                {saved.length}
              </span>
            )}
          </div>

          {/* Auth gate */}
          {!authLoading && !user && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 bg-cream-100 rounded-full flex items-center justify-center mb-6">
                <Heart size={28} className="text-navy-300" />
              </div>
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                Sign in to see your saved listings
              </h2>
              <p className="text-navy-400 mb-6 text-center max-w-md">
                Save your favorite stays, tours, and experiences so you can easily find them later.
              </p>
              <Link
                href="/auth/signin"
                className="bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-600 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Loading */}
          {(authLoading || (user && loading)) && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={32} className="animate-spin text-gold-500" />
            </div>
          )}

          {/* Empty state */}
          {user && !loading && saved.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 bg-cream-100 rounded-full flex items-center justify-center mb-6">
                <Heart size={28} className="text-navy-300" />
              </div>
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                No saved listings yet
              </h2>
              <p className="text-navy-400 mb-6 text-center max-w-md">
                Tap the heart icon on any listing to save it here for later.
              </p>
              <Link
                href="/explore"
                className="bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-600 transition-colors"
              >
                Explore Listings
              </Link>
            </div>
          )}

          {/* Saved listings grid */}
          {user && !loading && saved.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
              {saved.map((listing) => (
                <div key={listing.id} className="relative">
                  <ListingCard
                    id={listing.id}
                    title={listing.title}
                    slug={listing.slug}
                    type={listing.type}
                    priceAmount={listing.priceAmount}
                    priceUnit={listing.priceUnit}
                    avgRating={listing.avgRating}
                    reviewCount={listing.reviewCount}
                    parish={listing.parish}
                    islandSlug={listing.islandSlug}
                    islandName={listing.islandName}
                    image={null}
                    isFeatured={listing.isFeatured}
                  />
                  <button
                    onClick={async () => {
                      await toggle(listing.id);
                      setSaved((prev) => prev.filter((l) => l.id !== listing.id));
                    }}
                    className="absolute top-3 right-3 z-10 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-navy-400 hover:text-red-500 hover:bg-white transition-colors shadow-sm"
                    aria-label="Remove from saved"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
