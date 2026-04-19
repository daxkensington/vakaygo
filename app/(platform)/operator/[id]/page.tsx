"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ListingCard } from "@/components/listings/listing-card";
import {
  Star,
  ShieldCheck,
  CalendarDays,
  MessageSquare,
  Loader2,
  AlertCircle,
  MapPin,
} from "lucide-react";

type Operator = {
  id: string;
  name: string | null;
  businessName: string | null;
  businessDescription: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

type Listing = {
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
  image: string | null;
};

type Stats = {
  totalListings: number;
  totalReviews: number;
  avgRating: number;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={16}
          className={
            i <= Math.round(rating)
              ? "text-gold-700 fill-gold-500"
              : "text-navy-200"
          }
        />
      ))}
    </div>
  );
}

function AvatarInitial({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <div
        className="w-20 h-20 rounded-full bg-cover bg-center ring-4 ring-white shadow-lg"
        style={{ backgroundImage: `url(${avatarUrl})` }}
      />
    );
  }
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gold-400 to-teal-500 ring-4 ring-white shadow-lg flex items-center justify-center">
      <span className="text-white font-display text-2xl font-bold">
        {initials}
      </span>
    </div>
  );
}

export default function OperatorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [operator, setOperator] = useState<Operator | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/operators/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Operator not found");
        }
        return res.json();
      })
      .then((data) => {
        setOperator(data.operator);
        setListings(data.listings);
        setStats(data.stats);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const memberYear = operator
    ? new Date(operator.createdAt).getFullYear()
    : null;
  const displayName =
    operator?.businessName || operator?.name || "Operator";

  return (
    <>
      <Header />
      <main className="min-h-screen bg-cream-50">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-40">
            <Loader2 className="animate-spin text-gold-700" size={40} />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="max-w-2xl mx-auto px-4 py-40 text-center">
            <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
            <h1 className="font-display text-2xl text-navy-700 mb-2">
              {error}
            </h1>
            <p className="text-navy-400">
              This operator profile could not be loaded.
            </p>
          </div>
        )}

        {/* Profile */}
        {operator && stats && !loading && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            {/* Profile Header Card */}
            <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6 sm:p-8 mb-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <AvatarInitial
                  name={displayName}
                  avatarUrl={operator.avatarUrl}
                />
                <div className="text-center sm:text-left flex-1">
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-navy-700">
                    {displayName}
                  </h1>
                  {operator.businessName && operator.name && (
                    <p className="text-navy-400 mt-1">
                      Operated by {operator.name}
                    </p>
                  )}
                  <p className="text-navy-300 text-sm mt-1">
                    Member since{" "}
                    {new Date(operator.createdAt).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-cream-100">
                <div className="text-center">
                  <p className="font-display text-2xl sm:text-3xl font-bold text-teal-600">
                    {stats.totalListings}
                  </p>
                  <p className="text-navy-400 text-sm mt-0.5">
                    Active Listings
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <p className="font-display text-2xl sm:text-3xl font-bold text-gold-700">
                      {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "--"}
                    </p>
                  </div>
                  {stats.avgRating > 0 && (
                    <div className="flex justify-center mt-1">
                      <StarRating rating={stats.avgRating} />
                    </div>
                  )}
                  <p className="text-navy-400 text-sm mt-0.5">
                    Average Rating
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-display text-2xl sm:text-3xl font-bold text-teal-600">
                    {stats.totalReviews}
                  </p>
                  <p className="text-navy-400 text-sm mt-0.5">
                    Total Reviews
                  </p>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-3 mb-8">
              <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-[var(--shadow-card)] text-sm">
                <ShieldCheck size={16} className="text-teal-500" />
                <span className="text-navy-600 font-medium">
                  Verified Operator
                </span>
              </div>
              {memberYear && (
                <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-[var(--shadow-card)] text-sm">
                  <CalendarDays size={16} className="text-gold-700" />
                  <span className="text-navy-600 font-medium">
                    Member Since {memberYear}
                  </span>
                </div>
              )}
              {stats.totalReviews > 0 && (
                <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-[var(--shadow-card)] text-sm">
                  <MessageSquare size={16} className="text-teal-500" />
                  <span className="text-navy-600 font-medium">
                    {stats.totalReviews}+ Reviews
                  </span>
                </div>
              )}
            </div>

            {/* About Section */}
            {operator.businessDescription && (
              <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6 sm:p-8 mb-8">
                <h2 className="font-display text-xl font-bold text-navy-700 mb-3">
                  About
                </h2>
                <p className="text-navy-500 leading-relaxed whitespace-pre-line">
                  {operator.businessDescription}
                </p>
              </div>
            )}

            {/* Listings */}
            <div className="mb-4">
              <h2 className="font-display text-2xl font-bold text-navy-700">
                Listings by {displayName}
              </h2>
            </div>

            {listings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} {...listing} />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-12 text-center">
                <MapPin className="mx-auto text-navy-200 mb-4" size={48} />
                <h3 className="font-display text-xl text-navy-600 mb-2">
                  No Active Listings
                </h3>
                <p className="text-navy-400">
                  This operator doesn&apos;t have any active listings right now.
                  Check back soon!
                </p>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
