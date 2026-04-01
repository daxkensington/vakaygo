"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  DollarSign,
  CalendarCheck,
  Star,
  ListPlus,
  Eye,
  Clock,
  MessageCircle,
  TrendingUp,
  Loader2,
} from "lucide-react";

type Stats = {
  totalRevenue: number;
  bookingsThisMonth: number;
  totalBookings: number;
  avgRating: number;
  totalReviews: number;
  activeListings: number;
  pendingBookings: number;
  unreadMessages: number;
  recentBookings: {
    id: string;
    bookingNumber: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    listingTitle: string;
    travelerName: string | null;
  }[];
  monthlyRevenue: {
    month: string;
    revenue: number;
    count: number;
  }[];
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
  no_show: "bg-rose-100 text-rose-700",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={
            i <= Math.round(rating)
              ? "text-gold-500 fill-gold-500"
              : "text-navy-200"
          }
        />
      ))}
    </span>
  );
}

export default function OperatorDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/operator/stats")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    );
  }

  const displayName = user?.businessName || user?.name || "Operator";
  const maxRevenue = stats
    ? Math.max(...stats.monthlyRevenue.map((m) => m.revenue), 1)
    : 1;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Welcome back, {displayName}
        </h1>
        <p className="text-navy-400 mt-1">
          Here&apos;s how your business is performing
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-50 text-gold-600">
              <DollarSign size={20} />
            </div>
            <TrendingUp size={16} className="text-navy-200" />
          </div>
          <p className="text-2xl font-bold text-navy-700">
            ${stats?.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00"}
          </p>
          <p className="text-sm text-navy-400 mt-1">Total Revenue</p>
          <p className="text-xs text-navy-300 mt-2">
            {stats?.totalBookings ?? 0} completed booking{stats?.totalBookings !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-50 text-teal-600">
              <CalendarCheck size={20} />
            </div>
            <TrendingUp size={16} className="text-navy-200" />
          </div>
          <p className="text-2xl font-bold text-navy-700">
            {stats?.bookingsThisMonth ?? 0}
          </p>
          <p className="text-sm text-navy-400 mt-1">Bookings This Month</p>
          <p className="text-xs text-navy-300 mt-2">
            {stats?.totalBookings ?? 0} all time
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-50 text-gold-600">
              <Star size={20} />
            </div>
            {stats && stats.avgRating > 0 && <StarRating rating={stats.avgRating} />}
          </div>
          <p className="text-2xl font-bold text-navy-700">
            {stats && stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "\u2014"}
          </p>
          <p className="text-sm text-navy-400 mt-1">Avg Rating</p>
          <p className="text-xs text-navy-300 mt-2">
            {stats?.totalReviews ?? 0} review{stats?.totalReviews !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-50 text-teal-600">
              <ListPlus size={20} />
            </div>
            <TrendingUp size={16} className="text-navy-200" />
          </div>
          <p className="text-2xl font-bold text-navy-700">
            {stats?.activeListings ?? 0}
          </p>
          <p className="text-sm text-navy-400 mt-1">Active Listings</p>
          <p className="text-xs text-navy-300 mt-2">Published &amp; live</p>
        </div>
      </div>

      {/* Quick Alerts Row */}
      {stats && (stats.pendingBookings > 0 || stats.unreadMessages > 0) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {stats.pendingBookings > 0 && (
            <Link
              href="/operator/bookings"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-medium text-sm"
            >
              <Clock size={16} />
              {stats.pendingBookings} pending booking{stats.pendingBookings !== 1 ? "s" : ""} need attention
            </Link>
          )}
          {stats.unreadMessages > 0 && (
            <Link
              href="/messages"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors font-medium text-sm"
            >
              <MessageCircle size={16} />
              {stats.unreadMessages} unread message{stats.unreadMessages !== 1 ? "s" : ""}
            </Link>
          )}
        </div>
      )}

      {/* Monthly Revenue Chart & Recent Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Revenue Mini Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-bold text-navy-700 mb-4">
            Monthly Revenue
          </h2>
          {stats && stats.monthlyRevenue.length > 0 ? (
            <div className="flex items-end gap-3 h-40">
              {stats.monthlyRevenue.map((m) => {
                const pct = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
                const label = new Date(m.month + "-01").toLocaleDateString(
                  "en-US",
                  { month: "short" }
                );
                return (
                  <div
                    key={m.month}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <span className="text-xs font-semibold text-navy-500">
                      ${m.revenue >= 1000
                        ? (m.revenue / 1000).toFixed(1) + "k"
                        : m.revenue.toFixed(0)}
                    </span>
                    <div className="w-full relative" style={{ height: "100px" }}>
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-t-lg bg-gradient-to-t from-gold-500 to-gold-400 transition-all"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <span className="text-xs text-navy-400">{label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-navy-300 text-sm">
              No revenue data yet
            </div>
          )}
        </div>

        {/* Recent Bookings */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-bold text-navy-700 mb-4">
            Recent Bookings
          </h2>
          {stats && stats.recentBookings.length > 0 ? (
            <div className="space-y-3">
              {stats.recentBookings.map((b) => (
                <Link
                  key={b.id}
                  href={`/operator/bookings`}
                  className="flex items-center justify-between p-3 rounded-xl bg-cream-50 hover:bg-cream-100 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy-700 truncate">
                      {b.listingTitle}
                    </p>
                    <p className="text-xs text-navy-400 mt-0.5">
                      {b.travelerName || "Guest"} &middot; {b.bookingNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        statusColors[b.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {b.status.replace("_", " ")}
                    </span>
                    <span className="text-sm font-bold text-navy-700">
                      ${b.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-navy-300 text-sm">
              No bookings yet
            </div>
          )}
        </div>
      </div>

      {/* Getting Started - only show if no active listings */}
      {stats && stats.activeListings === 0 && (
        <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
          <h2 className="text-xl font-bold text-navy-700 mb-6">
            Get started with VakayGo
          </h2>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Create your first listing",
                description:
                  "Add your stay, tour, restaurant, event, or service to start reaching travelers.",
                action: "Create Listing",
                href: "/operator/listings/new",
                icon: ListPlus,
              },
              {
                step: "2",
                title: "Add photos",
                description:
                  "High-quality photos are the #1 factor in getting bookings. Add at least 5.",
                action: "Upload Photos",
                href: "#",
                icon: Eye,
              },
              {
                step: "3",
                title: "Set your pricing",
                description:
                  "Configure your rates, availability, and cancellation policy.",
                action: "Set Pricing",
                href: "#",
                icon: DollarSign,
              },
              {
                step: "4",
                title: "Go live",
                description:
                  "Submit your listing for review. We'll publish it within 24 hours.",
                action: "Submit",
                href: "#",
                icon: CalendarCheck,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex items-center gap-4 p-4 rounded-xl bg-cream-50 hover:bg-cream-100 transition-colors"
              >
                <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {item.step}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-navy-700">{item.title}</h3>
                  <p className="text-sm text-navy-400 mt-0.5">
                    {item.description}
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 text-sm font-semibold text-gold-500 hover:text-gold-600"
                >
                  {item.action} &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
