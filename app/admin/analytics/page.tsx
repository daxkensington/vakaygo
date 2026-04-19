"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Users,
  CalendarCheck,
  Star,
  ListPlus,
  Trophy,
  MapPin,
  Briefcase,
  Activity,
  TrendingUp,
} from "lucide-react";

type UserMonth = {
  month: string;
  count: number;
  travelers: number;
  operators: number;
};

type BookingFunnel = {
  totalBookings: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  conversionRate: number;
};

type TopListing = {
  title: string;
  type: string;
  bookingCount: number;
  revenue: number;
  avgRating: number;
};

type TopIsland = {
  name: string;
  listingCount: number;
  bookingCount: number;
  revenue: number;
};

type TopOperator = {
  name: string | null;
  businessName: string | null;
  listingCount: number;
  revenue: number;
};

type PlatformHealth = {
  activeListingsPercent: number;
  avgResponseTime: number;
  reviewRate: number;
  repeatBookingRate: number;
};

type RecentActivity = {
  newUsers: number;
  newBookings: number;
  newReviews: number;
  newListings: number;
};

type AnalyticsData = {
  usersByMonth: UserMonth[];
  bookingFunnel: BookingFunnel;
  topListings: TopListing[];
  topIslands: TopIsland[];
  topOperators: TopOperator[];
  platformHealth: PlatformHealth;
  recentActivity: RecentActivity;
};

/* ── Circular progress indicator (SVG) ──────────────────────── */
function CircularProgress({
  value,
  label,
  suffix = "%",
  color = "var(--color-gold-500)",
}: {
  value: number;
  label: string;
  suffix?: string;
  color?: string;
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const capped = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (capped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="100" height="100" className="shrink-0">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-cream-200)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          className="text-sm font-bold"
          fill="var(--color-navy-800)"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value.toFixed(1)}
          {suffix}
        </text>
      </svg>
      <span className="text-xs font-medium text-navy-500 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

/* ── Funnel bar ─────────────────────────────────────────────── */
function FunnelBar({
  label,
  count,
  total,
  widthPercent,
}: {
  label: string;
  count: number;
  total: number;
  widthPercent: number;
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="rounded-lg py-3 text-center text-white font-semibold text-sm transition-all duration-500"
        style={{
          width: `${widthPercent}%`,
          background: `linear-gradient(135deg, var(--color-navy-700), var(--color-navy-900))`,
          minWidth: "80px",
        }}
      >
        {count.toLocaleString()}
      </div>
      <span className="text-xs font-medium text-navy-600">
        {label} ({pct}%)
      </span>
    </div>
  );
}

/* ── Medal component ────────────────────────────────────────── */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 text-xs font-bold text-white shadow-sm">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-gray-300 to-gray-400 text-xs font-bold text-white shadow-sm">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 to-amber-700 text-xs font-bold text-white shadow-sm">
        3
      </span>
    );
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cream-200 text-xs font-bold text-navy-500">
      {rank}
    </span>
  );
}

/* ── Format currency ────────────────────────────────────────── */
function fmt(n: number) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ── Type badge color ───────────────────────────────────────── */
function typeBadge(type: string) {
  const colors: Record<string, string> = {
    stay: "bg-blue-50 text-blue-700",
    tour: "bg-green-50 text-green-700",
    dining: "bg-orange-50 text-orange-700",
    event: "bg-purple-50 text-purple-700",
    transport: "bg-teal-50 text-teal-700",
    guide: "bg-pink-50 text-pink-700",
    excursion: "bg-cyan-50 text-cyan-700",
    transfer: "bg-indigo-50 text-indigo-700",
    vip: "bg-amber-50 text-amber-700",
  };
  return colors[type] ?? "bg-cream-100 text-navy-600";
}

/* ================================================================
   MAIN PAGE
   ================================================================ */
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load analytics");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold-700" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-red-500">{error || "No data"}</p>
      </div>
    );
  }

  const { usersByMonth, bookingFunnel, topListings, topIslands, topOperators, platformHealth, recentActivity } = data;

  // Chart bar scale
  const maxUsers = Math.max(...usersByMonth.map((m) => m.count), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold text-navy-800 md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Analytics
        </h1>
        <p className="mt-1 text-navy-400">
          Platform performance and growth metrics
        </p>
      </div>

      {/* ── 1. Recent Activity Cards ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "New Users",
            value: recentActivity.newUsers,
            icon: Users,
            accent: "text-blue-500",
            bg: "bg-blue-50",
          },
          {
            label: "New Bookings",
            value: recentActivity.newBookings,
            icon: CalendarCheck,
            accent: "text-green-500",
            bg: "bg-green-50",
          },
          {
            label: "New Reviews",
            value: recentActivity.newReviews,
            icon: Star,
            accent: "text-amber-500",
            bg: "bg-amber-50",
          },
          {
            label: "New Listings",
            value: recentActivity.newListings,
            icon: ListPlus,
            accent: "text-purple-500",
            bg: "bg-purple-50",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-navy-400">
                  {card.label}
                </p>
                <p
                  className="mt-1 text-3xl font-bold text-navy-800"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {card.value}
                </p>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.bg}`}
              >
                <card.icon className={`h-5 w-5 ${card.accent}`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-navy-400">Last 7 days</p>
          </div>
        ))}
      </div>

      {/* ── 2. User Growth Chart ────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gold-700" />
          <h2
            className="text-lg font-bold text-navy-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            User Growth
          </h2>
          <span className="ml-auto text-xs text-navy-400">Last 12 months</span>
        </div>

        {/* Legend */}
        <div className="mb-3 flex gap-4 text-xs text-navy-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "linear-gradient(135deg, #d4a017, #e6b422)" }} />
            Travelers
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "linear-gradient(135deg, #1e3a5f, #2b5580)" }} />
            Operators
          </span>
        </div>

        {usersByMonth.length === 0 ? (
          <p className="py-12 text-center text-navy-400">No user data yet</p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 180 }}>
            {usersByMonth.map((m) => {
              const travelerH = (m.travelers / maxUsers) * 140;
              const operatorH = (m.operators / maxUsers) * 140;
              return (
                <div
                  key={m.month}
                  className="flex flex-col items-center gap-1"
                  style={{ minWidth: 44 }}
                >
                  <span className="text-[10px] font-semibold text-navy-600">
                    {m.count}
                  </span>
                  <div className="flex flex-col-reverse">
                    <div
                      className="w-8 rounded-b-md"
                      style={{
                        height: Math.max(travelerH, 2),
                        background: "linear-gradient(180deg, #e6b422, #d4a017)",
                      }}
                    />
                    <div
                      className="w-8 rounded-t-md"
                      style={{
                        height: Math.max(operatorH, 1),
                        background: "linear-gradient(180deg, #2b5580, #1e3a5f)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-navy-400">
                    {m.month.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Booking Funnel ───────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-gold-700" />
          <h2
            className="text-lg font-bold text-navy-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Booking Funnel
          </h2>
          <span className="ml-auto rounded-lg bg-gold-50 px-2 py-0.5 text-xs font-medium text-gold-700">
            {(bookingFunnel.conversionRate * 100).toFixed(1)}% conversion
          </span>
        </div>

        <div className="flex flex-col items-center gap-3">
          <FunnelBar
            label="Total Bookings"
            count={bookingFunnel.totalBookings}
            total={bookingFunnel.totalBookings}
            widthPercent={100}
          />
          <FunnelBar
            label="Confirmed"
            count={bookingFunnel.confirmed + bookingFunnel.completed}
            total={bookingFunnel.totalBookings}
            widthPercent={
              bookingFunnel.totalBookings > 0
                ? ((bookingFunnel.confirmed + bookingFunnel.completed) /
                    bookingFunnel.totalBookings) *
                  100
                : 0
            }
          />
          <FunnelBar
            label="Completed"
            count={bookingFunnel.completed}
            total={bookingFunnel.totalBookings}
            widthPercent={
              bookingFunnel.totalBookings > 0
                ? (bookingFunnel.completed / bookingFunnel.totalBookings) * 100
                : 0
            }
          />
          <div className="mt-2 flex gap-6 text-xs text-navy-400">
            <span>
              Pending:{" "}
              <strong className="text-navy-600">{bookingFunnel.pending}</strong>
            </span>
            <span>
              Cancelled:{" "}
              <strong className="text-navy-600">
                {bookingFunnel.cancelled}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── 4. Top Performers (3 columns) ───────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Listings */}
        <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-gold-700" />
            <h2
              className="text-sm font-bold text-navy-800"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Top Listings
            </h2>
          </div>
          {topListings.length === 0 ? (
            <p className="py-6 text-center text-sm text-navy-400">No data</p>
          ) : (
            <ol className="space-y-3">
              {topListings.map((l, i) => (
                <li key={i} className="flex items-start gap-3">
                  <RankBadge rank={i + 1} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-800">
                      {l.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-navy-400">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeBadge(l.type)}`}
                      >
                        {l.type}
                      </span>
                      <span>{l.bookingCount} bookings</span>
                      <span className="ml-auto font-semibold text-navy-600">
                        {fmt(l.revenue)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Top Islands */}
        <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-gold-700" />
            <h2
              className="text-sm font-bold text-navy-800"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Top Islands
            </h2>
          </div>
          {topIslands.length === 0 ? (
            <p className="py-6 text-center text-sm text-navy-400">No data</p>
          ) : (
            <ol className="space-y-3">
              {topIslands.map((isl, i) => (
                <li key={i} className="flex items-start gap-3">
                  <RankBadge rank={i + 1} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-800">
                      {isl.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-navy-400">
                      <span>{isl.listingCount} listings</span>
                      <span>{isl.bookingCount} bookings</span>
                      <span className="ml-auto font-semibold text-navy-600">
                        {fmt(isl.revenue)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Top Operators */}
        <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-gold-700" />
            <h2
              className="text-sm font-bold text-navy-800"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Top Operators
            </h2>
          </div>
          {topOperators.length === 0 ? (
            <p className="py-6 text-center text-sm text-navy-400">No data</p>
          ) : (
            <ol className="space-y-3">
              {topOperators.map((op, i) => (
                <li key={i} className="flex items-start gap-3">
                  <RankBadge rank={i + 1} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-800">
                      {op.businessName || op.name || "Unnamed"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-navy-400">
                      <span>{op.listingCount} listings</span>
                      <span className="ml-auto font-semibold text-navy-600">
                        {fmt(op.revenue)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* ── 5. Platform Health ──────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
        <div className="mb-6 flex items-center gap-2">
          <Activity className="h-5 w-5 text-gold-700" />
          <h2
            className="text-lg font-bold text-navy-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Platform Health
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <CircularProgress
            value={platformHealth.activeListingsPercent}
            label="Active Listings"
            color="var(--color-gold-500)"
          />
          <CircularProgress
            value={Math.min(platformHealth.reviewRate, 100)}
            label="Review Rate"
            color="#10b981"
          />
          <CircularProgress
            value={bookingFunnel.conversionRate * 100}
            label="Conversion Rate"
            color="#6366f1"
          />
          <CircularProgress
            value={platformHealth.repeatBookingRate}
            label="Repeat Bookings"
            color="#f59e0b"
          />
        </div>
      </div>

      {/* ── 6. Booking Distribution by Island ───────────────────── */}
      <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-gold-700" />
          <h2
            className="text-lg font-bold text-navy-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Booking Distribution by Island
          </h2>
        </div>
        {topIslands.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy-400">No island data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-200 text-left text-xs font-medium uppercase tracking-wide text-navy-400">
                  <th className="pb-3 pr-4">Island</th>
                  <th className="pb-3 pr-4 text-right">Listings</th>
                  <th className="pb-3 pr-4 text-right">Bookings</th>
                  <th className="pb-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topIslands.map((isl, i) => (
                  <tr
                    key={i}
                    className="border-b border-cream-100 last:border-0"
                  >
                    <td className="py-3 pr-4 font-medium text-navy-800">
                      {isl.name}
                    </td>
                    <td className="py-3 pr-4 text-right text-navy-500">
                      {isl.listingCount}
                    </td>
                    <td className="py-3 pr-4 text-right text-navy-500">
                      {isl.bookingCount}
                    </td>
                    <td className="py-3 text-right font-semibold text-navy-700">
                      {fmt(isl.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
