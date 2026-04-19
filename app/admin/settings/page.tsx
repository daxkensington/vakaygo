"use client";

import { useEffect, useState } from "react";
import {
  Settings,
  Globe,
  Percent,
  Database,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FileSearch,
} from "lucide-react";

type PlatformStats = {
  totals: {
    listings: number;
    users: number;
    bookings: number;
    waitlist: number;
  };
};

const COMMISSION_RATES = [
  { type: "Stay", traveler: 6, operator: 3 },
  { type: "Tour", traveler: 6, operator: 5 },
  { type: "Dining", traveler: 5, operator: 3 },
  { type: "Event", traveler: 6, operator: 5 },
  { type: "Transport", traveler: 5, operator: 3 },
  { type: "Excursion", traveler: 6, operator: 5 },
  { type: "Transfer", traveler: 5, operator: 3 },
  { type: "VIP", traveler: 8, operator: 5 },
  { type: "Guide", traveler: 6, operator: 5 },
];

export default function AdminSettingsPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [clearingCache, setClearingCache] = useState(false);
  const [rebuildingSitemap, setRebuildingSitemap] = useState(false);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  function handleClearCache() {
    setClearingCache(true);
    // Simulated -- no backend yet
    setTimeout(() => setClearingCache(false), 1500);
  }

  function handleRebuildSitemap() {
    setRebuildingSitemap(true);
    // Simulated -- no backend yet
    setTimeout(() => setRebuildingSitemap(false), 1500);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Settings className="h-7 w-7 text-gold-700" />
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h1>
      </div>

      <div className="space-y-8">
        {/* ── Platform Info ── */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50">
              <Globe className="h-5 w-5 text-navy-600" />
            </div>
            <h2
              className="text-lg font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Platform Info
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1">
                Site Name
              </label>
              <p className="text-navy-700 font-medium">VakayGo</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1">
                Tagline
              </label>
              <p className="text-navy-700 font-medium">
                Your Island Adventure Starts Here
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1">
                Support Email
              </label>
              <p className="text-navy-700 font-medium">support@vakaygo.com</p>
            </div>
          </div>
        </div>

        {/* ── Commission Rates ── */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50">
              <Percent className="h-5 w-5 text-gold-700" />
            </div>
            <div>
              <h2
                className="text-lg font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Commission Rates
              </h2>
              <p className="text-sm text-navy-400">
                Current platform fees by listing type
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50">
                  <th className="px-4 py-3 text-left font-semibold text-navy-500">
                    Listing Type
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-navy-500">
                    Traveler Fee
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-navy-500">
                    Operator Fee
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-navy-500">
                    Total Take
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMMISSION_RATES.map((rate) => (
                  <tr
                    key={rate.type}
                    className="border-b border-cream-100 transition-colors hover:bg-cream-50"
                  >
                    <td className="px-4 py-3 font-medium text-navy-700">
                      {rate.type}
                    </td>
                    <td className="px-4 py-3 text-center text-navy-600">
                      <span className="inline-block rounded-full bg-blue-50 px-3 py-0.5 text-xs font-semibold text-blue-700">
                        {rate.traveler}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-navy-600">
                      <span className="inline-block rounded-full bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-700">
                        {rate.operator}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block rounded-full bg-green-50 px-3 py-0.5 text-xs font-bold text-green-700">
                        {rate.traveler + rate.operator}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Platform Stats ── */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
              <Database className="h-5 w-5 text-green-600" />
            </div>
            <h2
              className="text-lg font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Platform Stats
            </h2>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gold-700" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Users", value: stats.totals.users },
                { label: "Listings", value: stats.totals.listings },
                { label: "Bookings", value: stats.totals.bookings },
                { label: "Waitlist", value: stats.totals.waitlist },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl bg-cream-50 p-4 text-center"
                >
                  <p className="text-2xl font-bold text-navy-700">
                    {item.value.toLocaleString()}
                  </p>
                  <p className="text-sm text-navy-400 mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-navy-400 text-sm">Failed to load stats</p>
          )}
        </div>

        {/* ── Danger Zone ── */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6 border border-red-100">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2
                className="text-lg font-bold text-red-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Danger Zone
              </h2>
              <p className="text-sm text-navy-400">
                These actions can affect the live platform
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleClearCache}
              disabled={clearingCache}
              className="flex items-center gap-2 rounded-xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {clearingCache ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {clearingCache ? "Clearing..." : "Clear Cache"}
            </button>
            <button
              onClick={handleRebuildSitemap}
              disabled={rebuildingSitemap}
              className="flex items-center gap-2 rounded-xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {rebuildingSitemap ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSearch className="h-4 w-4" />
              )}
              {rebuildingSitemap ? "Rebuilding..." : "Rebuild Sitemap"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
