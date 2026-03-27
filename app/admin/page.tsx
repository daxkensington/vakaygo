"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ListPlus,
  Users,
  CalendarCheck,
  Mail,
  Globe,
  TrendingUp,
  Loader2,
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50">
        <Loader2 size={40} className="animate-spin text-gold-500" />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Total Listings", value: stats.totals.listings.toLocaleString(), icon: ListPlus, color: "bg-gold-50 text-gold-600" },
    { label: "Users", value: stats.totals.users.toLocaleString(), icon: Users, color: "bg-teal-50 text-teal-600" },
    { label: "Bookings", value: stats.totals.bookings.toLocaleString(), icon: CalendarCheck, color: "bg-gold-50 text-gold-600" },
    { label: "Waitlist", value: stats.totals.waitlist.toLocaleString(), icon: Mail, color: "bg-teal-50 text-teal-600" },
  ];

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="bg-navy-700 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard size={20} />
          <span className="text-lg font-bold">
            Vakay<span className="text-gold-400">Go</span> Admin
          </span>
        </div>
        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← Back to site
        </Link>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-3xl font-bold text-navy-700 mb-8" style={{ fontFamily: "var(--font-display)" }}>
          Platform Dashboard
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  <s.icon size={20} />
                </div>
                <TrendingUp size={16} className="text-navy-200" />
              </div>
              <p className="text-3xl font-bold text-navy-700">{s.value}</p>
              <p className="text-sm text-navy-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Listings by Type */}
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-bold text-navy-700 mb-4 flex items-center gap-2">
              <ListPlus size={18} className="text-gold-500" />
              Listings by Type
            </h2>
            <div className="space-y-3">
              {stats.listingsByType.map((row) => {
                const pct = Math.round((row.count / stats.totals.listings) * 100);
                return (
                  <div key={row.type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-navy-600 capitalize">{row.type}</span>
                      <span className="text-navy-400">{row.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-cream-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gold-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Listings by Island */}
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-bold text-navy-700 mb-4 flex items-center gap-2">
              <Globe size={18} className="text-teal-500" />
              Listings by Island
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {stats.listingsByIsland.map((row) => (
                <div key={row.name} className="flex justify-between items-center py-1.5">
                  <span className="text-sm font-medium text-navy-600">{row.name}</span>
                  <span className="bg-cream-100 text-navy-500 px-3 py-1 rounded-full text-xs font-semibold">
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Bookings */}
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] lg:col-span-2">
            <h2 className="font-bold text-navy-700 mb-4 flex items-center gap-2">
              <CalendarCheck size={18} className="text-gold-500" />
              Recent Bookings
            </h2>
            {stats.recentBookings.length === 0 ? (
              <p className="text-navy-400 text-sm">No bookings yet</p>
            ) : (
              <div className="space-y-3">
                {stats.recentBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-cream-50">
                    <div>
                      <p className="font-medium text-navy-700 text-sm">{b.listingTitle}</p>
                      <p className="text-xs text-navy-400">#{b.bookingNumber} · {new Date(b.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-navy-700">${parseFloat(b.totalAmount).toFixed(2)}</p>
                      <p className="text-xs text-navy-400 capitalize">{b.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
