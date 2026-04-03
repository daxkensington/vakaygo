"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { ListingCard } from "@/components/listings/listing-card";
import { RecommendedListings } from "@/components/recommendations/recommended-listings";
import { TrendingListings } from "@/components/recommendations/trending-listings";
import Link from "next/link";
import {
  ArrowRight,
  LayoutDashboard,
  List,
  CalendarCheck,
  MessageSquare,
  Heart,
  Clock,
  MapPin,
} from "lucide-react";

type ListingData = {
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

type OperatorStats = {
  pendingBookings: number;
  unreadMessages: number;
  activeListings: number;
  bookingsThisMonth: number;
};

type SavedTrip = {
  id: string;
  title: string;
  islandId: number | null;
  startDate: string | null;
};

function ContinueBrowsing() {
  const [listings, setListings] = useState<ListingData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recommendations/recent")
      .then((r) => r.json())
      .then((data) => setListings(data.listings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="h-8 w-44 bg-navy-100 rounded-lg animate-pulse mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-72 bg-navy-50 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (listings.length === 0) return null;

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center gap-3 mb-6">
          <Clock size={18} className="text-navy-400" />
          <h2
            className="text-xl md:text-2xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Continue Browsing
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {listings.map((listing) => (
            <ListingCard key={listing.id} {...listing} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SavedTrips() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trips")
      .then((r) => r.json())
      .then((data) => setTrips((data.trips || []).slice(0, 4)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || trips.length === 0) return null;

  return (
    <section className="py-12 bg-cream-50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between mb-6">
          <div className="flex items-center gap-3">
            <MapPin size={18} className="text-teal-600" />
            <h2
              className="text-xl md:text-2xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Your Saved Trips
            </h2>
          </div>
          <Link
            href="/trips"
            className="text-gold-700 font-semibold hover:text-gold-800 transition-colors text-sm flex items-center gap-1"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {trips.map((trip) => (
            <Link
              key={trip.id}
              href={`/trips/${trip.id}`}
              className="bg-white rounded-xl p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-0.5"
            >
              <h3 className="font-semibold text-navy-700 mb-1 line-clamp-1">
                {trip.title}
              </h3>
              {trip.startDate && (
                <p className="text-sm text-navy-400">
                  {new Date(trip.startDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function OperatorWelcome({
  name,
  stats,
}: {
  name: string;
  stats: OperatorStats | null;
}) {
  return (
    <section className="py-12 bg-gradient-to-br from-navy-700 to-navy-800">
      <div className="mx-auto max-w-7xl px-6">
        <h1
          className="text-3xl md:text-4xl font-bold text-white mb-8"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Welcome back, {name}
        </h1>

        {/* Quick stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-white/60 text-sm">Bookings Today</p>
              <p className="text-2xl font-bold text-white">
                {stats.bookingsThisMonth}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-white/60 text-sm">Pending</p>
              <p className="text-2xl font-bold text-gold-400">
                {stats.pendingBookings}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-white/60 text-sm">Unread Messages</p>
              <p className="text-2xl font-bold text-white">
                {stats.unreadMessages}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-white/60 text-sm">Active Listings</p>
              <p className="text-2xl font-bold text-teal-400">
                {stats.activeListings}
              </p>
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/operator"
            className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>
          <Link
            href="/operator/listings"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
          >
            <List size={16} />
            Listings
          </Link>
          <Link
            href="/operator/bookings"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
          >
            <CalendarCheck size={16} />
            Bookings
          </Link>
          <Link
            href="/messages"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
          >
            <MessageSquare size={16} />
            Messages
            {stats && stats.unreadMessages > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {stats.unreadMessages}
              </span>
            )}
          </Link>
        </div>
      </div>
    </section>
  );
}

function TravelerWelcome({ name }: { name: string }) {
  return (
    <section className="py-12 bg-gradient-to-br from-teal-600 to-teal-700">
      <div className="mx-auto max-w-7xl px-6">
        <h1
          className="text-3xl md:text-4xl font-bold text-white mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Welcome back, {name}
        </h1>
        <p className="text-white/80 text-lg">
          Ready for your next Caribbean adventure?
        </p>
        <div className="flex flex-wrap gap-3 mt-6">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
          >
            Explore <ArrowRight size={16} />
          </Link>
          <Link
            href="/saved"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
          >
            <Heart size={16} />
            Saved Listings
          </Link>
          <Link
            href="/trips"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
          >
            <MapPin size={16} />
            My Trips
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PersonalizedHome() {
  const { user, loading } = useAuth();
  const [operatorStats, setOperatorStats] = useState<OperatorStats | null>(
    null
  );

  useEffect(() => {
    if (user?.role === "operator") {
      fetch("/api/operator/stats")
        .then((r) => r.json())
        .then((data) => setOperatorStats(data))
        .catch(() => {});
    }
  }, [user]);

  if (loading) return null;
  if (!user) return null;

  const firstName = user.name?.split(" ")[0] || "there";

  return (
    <>
      {/* Welcome section */}
      {user.role === "operator" ? (
        <OperatorWelcome name={firstName} stats={operatorStats} />
      ) : (
        <TravelerWelcome name={firstName} />
      )}

      {/* Traveler personalized sections */}
      {user.role === "traveler" && (
        <>
          <ContinueBrowsing />
          <RecommendedListings />
          <SavedTrips />
          <TrendingListings />
        </>
      )}

      {/* Operators also get trending */}
      {user.role === "operator" && <TrendingListings />}
    </>
  );
}
