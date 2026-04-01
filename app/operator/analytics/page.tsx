"use client";

import { useEffect, useState, useMemo } from "react";
import { Eye, ShoppingCart, TrendingUp, DollarSign, Loader2, BarChart3 } from "lucide-react";

type ListingStat = {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  totalViews: number;
  views7d: number;
  views30d: number;
  bookings: number;
  conversionRate: number;
  revenue: number;
};

type DayView = { date: string; views: number };

type Analytics = {
  listings: ListingStat[];
  aggregate: {
    totalViews: number;
    totalBookings: number;
    conversionRate: number;
    totalRevenue: number;
    viewsByDay: DayView[];
  };
};

type SortKey = "title" | "type" | "views30d" | "bookings" | "conversionRate" | "revenue";
type SortDir = "asc" | "desc";

const typeLabels: Record<string, string> = {
  stay: "Stay",
  tour: "Tour",
  dining: "Dining",
  event: "Event",
  transport: "Transport",
  guide: "Guide",
  excursion: "Excursion",
  transfer: "Transfer",
  vip: "VIP",
};

export default function OperatorAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("views30d");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/operator/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const sortedListings = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.listings].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [data, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function conversionColor(rate: number) {
    if (rate >= 5) return "text-teal-600 bg-teal-50";
    if (rate >= 2) return "text-amber-600 bg-amber-50";
    return "text-red-500 bg-red-50";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-gold-500" />
      </div>
    );
  }

  if (!data || (data.listings.length === 0 && data.aggregate.totalViews === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-20 h-20 bg-cream-100 rounded-2xl flex items-center justify-center mb-6">
          <BarChart3 size={36} className="text-navy-300" />
        </div>
        <h2 className="text-2xl font-bold text-navy-700 mb-2">No analytics yet</h2>
        <p className="text-navy-400 max-w-md">
          Analytics will appear here once your listings start receiving views. Create a listing and share it to get started.
        </p>
      </div>
    );
  }

  const agg = data.aggregate;
  const maxDayViews = Math.max(...agg.viewsByDay.map((d) => d.views), 1);

  // Fill in missing days for the chart
  const chartDays: DayView[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = agg.viewsByDay.find((v) => v.date === dateStr);
    chartDays.push({ date: dateStr, views: found?.views || 0 });
  }
  const chartMax = Math.max(...chartDays.map((d) => d.views), 1);

  return (
    <div>
      <h1
        className="text-2xl md:text-3xl font-bold text-navy-700 mb-8"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Analytics
      </h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Eye size={18} className="text-blue-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-navy-700">{agg.totalViews.toLocaleString()}</p>
          <p className="text-sm text-navy-400 mt-1">Views (30d)</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <ShoppingCart size={18} className="text-teal-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-navy-700">{agg.totalBookings.toLocaleString()}</p>
          <p className="text-sm text-navy-400 mt-1">Total Bookings</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-navy-700">{agg.conversionRate}%</p>
          <p className="text-sm text-navy-400 mt-1">Conversion Rate</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gold-50 rounded-xl flex items-center justify-center">
              <DollarSign size={18} className="text-gold-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-navy-700">
            ${agg.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-navy-400 mt-1">Total Revenue</p>
        </div>
      </div>

      {/* Views Chart */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-10">
        <h2 className="text-lg font-bold text-navy-700 mb-6">Daily Views — Last 30 Days</h2>
        <div className="flex items-end gap-[3px] h-40">
          {chartDays.map((day) => {
            const pct = chartMax > 0 ? (day.views / chartMax) * 100 : 0;
            return (
              <div
                key={day.date}
                className="flex-1 group relative"
              >
                <div
                  className="bg-gold-400 hover:bg-gold-500 rounded-t transition-colors w-full"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-navy-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                  {day.date.slice(5)}: {day.views} views
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-navy-300">
          <span>{chartDays[0]?.date.slice(5)}</span>
          <span>{chartDays[chartDays.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Listing Performance Table */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="p-6 pb-0">
          <h2 className="text-lg font-bold text-navy-700 mb-4">Listing Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-100">
                {([
                  ["title", "Listing"],
                  ["type", "Type"],
                  ["views30d", "Views (30d)"],
                  ["bookings", "Bookings"],
                  ["conversionRate", "Conv. Rate"],
                  ["revenue", "Revenue"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    className="px-6 py-3 text-left font-semibold text-navy-500 cursor-pointer hover:text-navy-700 select-none"
                    onClick={() => handleSort(key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortKey === key && (
                        <span className="text-gold-500">
                          {sortDir === "asc" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedListings.map((listing) => (
                <tr
                  key={listing.id}
                  className="border-b border-cream-50 hover:bg-cream-50/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium text-navy-700 line-clamp-1">{listing.title}</p>
                    <p className="text-xs text-navy-300 mt-0.5">{listing.status}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-gold-50 text-gold-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                      {typeLabels[listing.type] || listing.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-navy-700">
                    {listing.views30d.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-semibold text-navy-700">
                    {listing.bookings.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${conversionColor(listing.conversionRate)}`}
                    >
                      {listing.conversionRate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-navy-700">
                    ${listing.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
