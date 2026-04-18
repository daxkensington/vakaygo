"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ListPlus,
  Users,
  CalendarCheck,
  Mail,
  Globe,
  TrendingUp,
  Loader2,
  DollarSign,
  Percent,
  CheckCircle,
  UserPlus,
  Download,
  Clock,
  RefreshCw,
  Star,
  Activity,
} from "lucide-react";

type Stats = {
  totals: { listings: number; users: number; bookings: number; waitlist: number };
  listingsByType: { type: string; count: number }[];
  listingsByIsland: { name: string; count: number }[];
  recentBookings: {
    id: string;
    bookingNumber: string;
    status: string;
    totalAmount: string;
    createdAt: string;
    listingTitle: string;
  }[];
};

type Revenue = {
  totalRevenue: number;
  platformFees: number;
  avgBookingValue: number;
  byMonth: { month: string; revenue: number; count: number }[];
  byIsland: { name: string; revenue: number; count: number }[];
  byType: { type: string; revenue: number; count: number }[];
};

type ActivityEvent = {
  type: "signup" | "booking" | "review" | "listing_approved";
  description: string;
  createdAt: string;
};

type ActivityData = {
  events: ActivityEvent[];
  today: { users: number; bookings: number; listings: number; reviews: number };
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-700",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [s, r, a] = await Promise.all([
        fetch("/api/admin/stats").then((r) => r.json()),
        fetch("/api/admin/revenue").then((r) => r.json()),
        fetch("/api/admin/activity").then((r) => r.json()),
      ]);
      setStats(s);
      setRevenue(r);
      setActivity(a);
      setSecondsAgo(0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const refreshInterval = setInterval(fetchAll, 30000);
    const tickInterval = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(tickInterval);
    };
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-gold-500" />
      </div>
    );
  }

  if (!stats || !revenue) return null;

  const todayStats = activity?.today ?? { users: 0, bookings: 0, listings: 0, reviews: 0 };

  const statCards = [
    {
      label: "Total Listings",
      value: stats.totals.listings.toLocaleString(),
      icon: ListPlus,
      iconBg: "bg-gold-50",
      iconColor: "text-gold-600",
      today: todayStats.listings,
    },
    {
      label: "Total Users",
      value: stats.totals.users.toLocaleString(),
      icon: Users,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      today: todayStats.users,
    },
    {
      label: "Total Bookings",
      value: stats.totals.bookings.toLocaleString(),
      icon: CalendarCheck,
      iconBg: "bg-gold-50",
      iconColor: "text-gold-600",
      today: todayStats.bookings,
    },
    {
      label: "Waitlist Signups",
      value: stats.totals.waitlist.toLocaleString(),
      icon: Mail,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      today: 0,
    },
    {
      label: "Total Revenue",
      value: formatCurrency(revenue.totalRevenue),
      icon: DollarSign,
      iconBg: "bg-gold-50",
      iconColor: "text-gold-600",
      today: 0,
    },
    {
      label: "Platform Fees",
      value: formatCurrency(revenue.platformFees),
      icon: Percent,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      today: 0,
    },
  ];

  // Revenue chart calculations
  const last12 = revenue.byMonth.slice(-12);
  const maxRevenue = Math.max(...last12.map((m) => m.revenue), 1);

  // Listings by type calculations
  const totalListings = Math.max(stats.totals.listings, 1);

  // Revenue by island calculations
  const maxIslandRevenue = Math.max(...revenue.byIsland.map((i) => i.revenue), 1);

  // Pending count for quick actions
  const pendingBookings = stats.recentBookings.filter((b) => b.status === "pending").length;

  return (
    <div>
      {/* Page title */}
      <div className="mb-8 flex items-center justify-between">
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Platform Dashboard
        </h1>
        <div className="flex items-center gap-2 text-xs text-navy-400">
          <RefreshCw size={12} className={secondsAgo < 2 ? "animate-spin" : ""} />
          <span>Updated {secondsAgo}s ago</span>
        </div>
      </div>

      {/* ── Top Stats Row ── */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.iconBg} ${s.iconColor}`}
              >
                <s.icon size={20} />
              </div>
              <TrendingUp size={16} className="text-navy-200" />
            </div>
            <p className="text-2xl font-bold text-navy-700">{s.value}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm text-navy-400">{s.label}</p>
              {s.today > 0 && (
                <span className="text-xs font-semibold text-green-600">+{s.today} today</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Live Activity Feed ── */}
      <div className="mb-8 bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-5 flex items-center gap-2 font-bold text-navy-700">
          <Activity size={18} className="text-gold-500" />
          Live Activity
        </h2>
        {(!activity || activity.events.length === 0) ? (
          <p className="text-sm text-navy-400">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {activity.events.map((event, i) => {
              const iconMap: Record<string, { icon: typeof Users; bg: string; color: string }> = {
                signup: { icon: UserPlus, bg: "bg-teal-50", color: "text-teal-600" },
                booking: { icon: CalendarCheck, bg: "bg-gold-50", color: "text-gold-600" },
                review: { icon: Star, bg: "bg-yellow-50", color: "text-yellow-600" },
                listing_approved: { icon: CheckCircle, bg: "bg-green-50", color: "text-green-600" },
              };
              const config = iconMap[event.type] ?? iconMap.signup;
              const EventIcon = config.icon;

              const diff = Date.now() - new Date(event.createdAt).getTime();
              const mins = Math.floor(diff / 60000);
              const hrs = Math.floor(mins / 60);
              const days = Math.floor(hrs / 24);
              let timeAgo = "just now";
              if (days > 0) timeAgo = `${days}d ago`;
              else if (hrs > 0) timeAgo = `${hrs}h ago`;
              else if (mins > 0) timeAgo = `${mins}m ago`;

              return (
                <div
                  key={`${event.type}-${i}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-cream-50"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg} ${config.color}`}>
                    <EventIcon size={16} />
                  </div>
                  <p className="flex-1 text-sm text-navy-600">{event.description}</p>
                  <span className="shrink-0 text-xs text-navy-400">{timeAgo}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Revenue Chart ── */}
      <div className="mb-8 bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-6 flex items-center gap-2 font-bold text-navy-700">
          <DollarSign size={18} className="text-gold-500" />
          Monthly Revenue
        </h2>
        {last12.length === 0 ? (
          <p className="text-sm text-navy-400">No revenue data yet</p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 220 }}>
            {last12.map((m) => {
              const heightPct = Math.max((m.revenue / maxRevenue) * 100, 2);
              return (
                <div
                  key={m.month}
                  className="flex flex-1 min-w-[48px] flex-col items-center gap-1"
                >
                  <span className="text-xs font-semibold text-navy-600">
                    {formatCurrency(m.revenue)}
                  </span>
                  <div
                    className="w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-gold-500 to-gold-400 transition-all"
                    style={{ height: `${heightPct * 1.6}px` }}
                  />
                  <span className="mt-1 text-[10px] font-medium text-navy-400">
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Two-Column Grid ── */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Listings by Type */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-5 flex items-center gap-2 font-bold text-navy-700">
            <ListPlus size={18} className="text-gold-500" />
            Listings by Type
          </h2>
          <div className="space-y-4">
            {stats.listingsByType.map((row) => {
              const pct = Math.round((row.count / totalListings) * 100);
              return (
                <div key={row.type}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium capitalize text-navy-600">
                      {row.type}
                    </span>
                    <span className="text-navy-400">
                      {row.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-cream-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {stats.listingsByType.length === 0 && (
              <p className="text-sm text-navy-400">No listings yet</p>
            )}
          </div>
        </div>

        {/* Revenue by Island */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-5 flex items-center gap-2 font-bold text-navy-700">
            <Globe size={18} className="text-teal-500" />
            Revenue by Island
          </h2>
          <div className="space-y-4">
            {revenue.byIsland.map((row) => {
              const pct = Math.round((row.revenue / maxIslandRevenue) * 100);
              return (
                <div key={row.name}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-navy-600">{row.name}</span>
                    <span className="text-navy-400">
                      {formatCurrency(row.revenue)} ({row.count} bookings)
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-cream-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {revenue.byIsland.length === 0 && (
              <p className="text-sm text-navy-400">No revenue data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Bookings Table ── */}
      <div className="mb-8 bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-5 flex items-center gap-2 font-bold text-navy-700">
          <CalendarCheck size={18} className="text-gold-500" />
          Recent Bookings
        </h2>
        {stats.recentBookings.length === 0 ? (
          <p className="text-sm text-navy-400">No bookings yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200">
                  <th className="pb-3 pr-4 font-semibold text-navy-500">Booking #</th>
                  <th className="pb-3 pr-4 font-semibold text-navy-500">Listing</th>
                  <th className="pb-3 pr-4 font-semibold text-navy-500">Amount</th>
                  <th className="pb-3 pr-4 font-semibold text-navy-500">Status</th>
                  <th className="pb-3 font-semibold text-navy-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentBookings.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-cream-100 last:border-0 hover:bg-cream-50 transition-colors"
                  >
                    <td className="py-3 pr-4 font-medium text-navy-700">
                      #{b.bookingNumber}
                    </td>
                    <td className="py-3 pr-4 text-navy-600">
                      <Link
                        href={`/admin/bookings`}
                        className="hover:text-gold-600 hover:underline"
                      >
                        {b.listingTitle}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-semibold text-navy-700">
                      ${parseFloat(b.totalAmount).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                          statusColors[b.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 text-navy-400">
                      {new Date(b.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-5 flex items-center gap-2 font-bold text-navy-700">
          <Clock size={18} className="text-gold-500" />
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/listings?status=pending"
            className="inline-flex items-center gap-2 rounded-xl bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-800"
          >
            <CheckCircle size={16} />
            Approve Pending Listings
            {pendingBookings > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/25 px-1.5 text-xs">
                {pendingBookings}
              </span>
            )}
          </Link>
          <Link
            href="/admin/users?sort=newest"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
          >
            <UserPlus size={16} />
            View New Users
          </Link>
          <button
            onClick={() => {
              window.open("/api/admin/export", "_blank");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-navy-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            <Download size={16} />
            Export Data
          </button>
        </div>
      </div>
    </div>
  );
}
