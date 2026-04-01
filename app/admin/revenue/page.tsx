"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, BarChart3, Globe, Loader2 } from "lucide-react";

type RevenueData = {
  totalRevenue: number;
  platformFees: number;
  avgBookingValue: number;
  byMonth: { month: string; revenue: number; count: number }[];
  byIsland: { name: string; revenue: number; count: number }[];
  byType: { type: string; revenue: number; count: number }[];
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMoneyFull(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/revenue")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-navy-400">Failed to load revenue data.</p>
      </div>
    );
  }

  const maxMonthRevenue = Math.max(...data.byMonth.map((m) => m.revenue), 1);
  const maxTypeRevenue = Math.max(...data.byType.map((t) => t.revenue), 1);

  const statCards = [
    {
      label: "Total Revenue",
      value: formatMoney(data.totalRevenue),
      icon: DollarSign,
      color: "bg-gold-50 text-gold-600",
    },
    {
      label: "Platform Fees",
      value: formatMoney(data.platformFees),
      icon: TrendingUp,
      color: "bg-teal-50 text-teal-600",
    },
    {
      label: "Avg Booking Value",
      value: formatMoney(data.avgBookingValue),
      icon: BarChart3,
      color: "bg-gold-50 text-gold-600",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <DollarSign className="h-7 w-7 text-gold-500" />
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Revenue
        </h1>
      </div>

      {/* Top Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}
              >
                <s.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-3xl font-bold text-navy-700">{s.value}</p>
            <p className="mt-1 text-sm text-navy-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Monthly Revenue Chart */}
      <div className="mb-8 bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
        <h2 className="mb-6 flex items-center gap-2 font-bold text-navy-700">
          <BarChart3 className="h-5 w-5 text-gold-500" />
          Monthly Revenue
        </h2>
        {data.byMonth.length === 0 ? (
          <p className="py-8 text-center text-navy-400">No monthly data yet</p>
        ) : (
          <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: 240 }}>
            {data.byMonth.map((m) => {
              const pct = Math.max((m.revenue / maxMonthRevenue) * 100, 4);
              return (
                <div
                  key={m.month}
                  className="flex min-w-[60px] flex-1 flex-col items-center gap-2"
                >
                  <span className="text-xs font-bold text-navy-700">
                    {formatMoney(m.revenue)}
                  </span>
                  <div
                    className="w-full max-w-[48px] rounded-t-lg bg-gradient-to-t from-gold-500 to-gold-400 transition-all"
                    style={{ height: `${pct * 1.8}px` }}
                  />
                  <div className="text-center">
                    <p className="text-xs font-medium text-navy-600">{m.month}</p>
                    <p className="text-[10px] text-navy-400">
                      {m.count} booking{m.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by Island */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-navy-700">
            <Globe className="h-5 w-5 text-teal-500" />
            Revenue by Island
          </h2>
          {data.byIsland.length === 0 ? (
            <p className="py-8 text-center text-navy-400">No island data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200">
                    <th className="pb-2 text-left font-semibold text-navy-500">Island</th>
                    <th className="pb-2 text-right font-semibold text-navy-500">Revenue</th>
                    <th className="pb-2 text-right font-semibold text-navy-500">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byIsland.map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-cream-100 transition-colors hover:bg-cream-50"
                    >
                      <td className="py-2.5 font-medium text-navy-700">{row.name}</td>
                      <td className="py-2.5 text-right font-bold text-navy-700">
                        {formatMoneyFull(row.revenue)}
                      </td>
                      <td className="py-2.5 text-right text-navy-500">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Revenue by Type */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-navy-700">
            <BarChart3 className="h-5 w-5 text-gold-500" />
            Revenue by Type
          </h2>
          {data.byType.length === 0 ? (
            <p className="py-8 text-center text-navy-400">No type data yet</p>
          ) : (
            <div className="space-y-4">
              {data.byType.map((row) => {
                const pct = Math.max((row.revenue / maxTypeRevenue) * 100, 2);
                return (
                  <div key={row.type}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-navy-600">{row.type}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-navy-400">
                          {row.count} booking{row.count !== 1 ? "s" : ""}
                        </span>
                        <span className="font-bold text-navy-700">
                          {formatMoneyFull(row.revenue)}
                        </span>
                      </div>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-cream-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
