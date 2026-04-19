"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { useAuth } from "@/lib/auth-context";
import {
  MapPin,
  Calendar,
  Users,
  Sparkles,
  Loader2,
  ArrowLeft,
  Sun,
  Cloud,
  Moon,
  Star,
  Share2,
  Pencil,
  Check,
  X,
  ExternalLink,
  Trash2,
} from "lucide-react";

type TripDetail = {
  id: string;
  userId: string;
  title: string;
  islandId: number | null;
  islandName: string | null;
  islandSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  guestCount: number;
  budget: string | null;
  interests: string[] | null;
  isAiGenerated: boolean;
  isPublic: boolean;
};

type TripItem = {
  id: string;
  tripId: string;
  listingId: string | null;
  dayNumber: number;
  timeSlot: string;
  customTitle: string;
  customNote: string | null;
  sortOrder: number;
  listing: {
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
    islandSlug: string;
    islandName: string;
    image: string | null;
  } | null;
};

const TIME_SLOT_CONFIG: Record<
  string,
  { label: string; icon: typeof Sun; color: string; bg: string; border: string }
> = {
  morning: {
    label: "Morning",
    icon: Sun,
    color: "text-gold-700",
    bg: "bg-gold-50",
    border: "border-gold-200",
  },
  afternoon: {
    label: "Afternoon",
    icon: Cloud,
    color: "text-teal-500",
    bg: "bg-teal-50",
    border: "border-teal-200",
  },
  evening: {
    label: "Evening",
    icon: Moon,
    color: "text-navy-500",
    bg: "bg-navy-50",
    border: "border-navy-200",
  },
};

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDay, setActiveDay] = useState(1);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!user && !authLoading) {
      setLoading(false);
      return;
    }
    if (!user) return;

    (async () => {
      try {
        const res = await fetch(`/api/trips/${id}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load trip");
          return;
        }
        const data = await res.json();
        setTrip(data.trip);
        setItems(data.items || []);
        setEditTitle(data.trip.title);
      } catch {
        setError("Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user, authLoading]);

  // Group items by day
  const dayGroups = items.reduce<Record<number, TripItem[]>>((acc, item) => {
    const d = item.dayNumber;
    if (!acc[d]) acc[d] = [];
    acc[d].push(item);
    return acc;
  }, {});

  const sortedDays = Object.keys(dayGroups)
    .map(Number)
    .sort((a, b) => a - b);

  const totalDays =
    trip?.startDate && trip?.endDate
      ? Math.max(
          1,
          Math.ceil(
            (new Date(trip.endDate).getTime() -
              new Date(trip.startDate).getTime()) /
              86400000
          )
        )
      : sortedDays.length;

  const allDays = Array.from({ length: totalDays }, (_, i) => i + 1);

  async function handleSaveTitle() {
    if (!trip || !editTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setTrip((prev) => (prev ? { ...prev, title: data.trip.title } : prev));
        setEditing(false);
      }
    } catch {
      /* silently fail */
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    if (!trip) return;
    // Toggle public and copy link
    try {
      await fetch(`/api/trips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      });
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* silently fail */
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
      if (res.ok) router.push("/trips");
    } catch {
      /* silently fail */
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getDayDate(dayNum: number) {
    if (!trip?.startDate) return "";
    const d = new Date(
      new Date(trip.startDate).getTime() + (dayNum - 1) * 86400000
    );
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-10">
          {/* Back link */}
          <Link
            href="/trips"
            className="inline-flex items-center gap-1.5 text-sm text-navy-400 hover:text-gold-600 transition-colors mb-6"
          >
            <ArrowLeft size={16} />
            Back to My Trips
          </Link>

          {/* Auth gate */}
          {!authLoading && !user && (
            <div className="flex flex-col items-center justify-center py-24">
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                Sign in to view this trip
              </h2>
              <Link
                href="/auth/signin"
                className="mt-4 bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-800 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={32} className="animate-spin text-gold-700" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-red-500 mb-4">{error}</p>
              <Link
                href="/trips"
                className="text-gold-700 hover:underline font-medium"
              >
                Go back to trips
              </Link>
            </div>
          )}

          {/* Trip detail */}
          {!loading && !error && trip && (
            <>
              {/* Trip header */}
              <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] overflow-hidden mb-8">
                <div className="h-2 bg-gradient-to-r from-gold-400 via-teal-400 to-gold-500" />
                <div className="p-6 md:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {editing ? (
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="text-2xl font-bold text-navy-700 bg-cream-50 rounded-xl px-3 py-1 focus:outline-none focus:ring-2 focus:ring-gold-400 flex-1"
                            style={{ fontFamily: "var(--font-display)" }}
                          />
                          <button
                            onClick={handleSaveTitle}
                            disabled={saving}
                            className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center hover:bg-teal-600 transition-colors"
                          >
                            {saving ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Check size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setEditing(false);
                              setEditTitle(trip.title);
                            }}
                            className="w-8 h-8 rounded-full bg-cream-100 text-navy-400 flex items-center justify-center hover:bg-cream-200 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 mb-3">
                          <h1
                            className="text-2xl md:text-3xl font-bold text-navy-700"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {trip.title}
                          </h1>
                          {trip.isAiGenerated && (
                            <span className="flex items-center gap-1 text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-full">
                              <Sparkles size={12} />
                              AI Generated
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-navy-400">
                        {trip.islandName && (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={14} className="text-gold-700" />
                            {trip.islandName}
                          </span>
                        )}
                        {trip.startDate && (
                          <span className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-gold-700" />
                            {formatDate(trip.startDate)}
                            {trip.endDate &&
                              ` - ${formatDate(trip.endDate)}`}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Users size={14} className="text-teal-500" />
                          {trip.guestCount} guest
                          {trip.guestCount !== 1 ? "s" : ""}
                        </span>
                        {trip.budget && (
                          <span className="text-gold-700 bg-gold-50 px-2 py-0.5 rounded-full text-xs font-medium">
                            {trip.budget}
                          </span>
                        )}
                      </div>

                      {/* Interests */}
                      {trip.interests && trip.interests.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {trip.interests.map((interest) => (
                            <span
                              key={interest}
                              className="text-xs bg-cream-100 text-navy-500 px-2.5 py-1 rounded-full font-medium"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleShare}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-50 text-navy-500 hover:bg-cream-100 transition-colors text-sm font-medium"
                      >
                        {shared ? (
                          <>
                            <Check size={14} className="text-teal-500" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Share2 size={14} />
                            Share
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-50 text-navy-500 hover:bg-cream-100 transition-colors text-sm font-medium"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        onClick={handleDelete}
                        className="w-9 h-9 rounded-xl bg-cream-50 text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors flex items-center justify-center"
                        aria-label="Delete trip"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Day tabs */}
              {allDays.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
                  {allDays.map((dayNum) => (
                    <button
                      key={dayNum}
                      onClick={() => setActiveDay(dayNum)}
                      className={`shrink-0 px-5 py-3 rounded-2xl font-semibold text-sm transition-all ${
                        activeDay === dayNum
                          ? "bg-gradient-to-r from-gold-700 to-gold-800 text-white shadow-lg shadow-gold-500/25"
                          : "bg-white text-navy-500 hover:bg-cream-100 shadow-sm"
                      }`}
                    >
                      <span className="block">Day {dayNum}</span>
                      {trip.startDate && (
                        <span
                          className={`block text-xs mt-0.5 ${activeDay === dayNum ? "text-gold-100" : "text-navy-300"}`}
                        >
                          {getDayDate(dayNum)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Timeline view for active day */}
              <div className="space-y-4">
                {(dayGroups[activeDay] || [])
                  .sort((a, b) => {
                    const order = { morning: 0, afternoon: 1, evening: 2 };
                    return (
                      (order[a.timeSlot as keyof typeof order] ?? 3) -
                      (order[b.timeSlot as keyof typeof order] ?? 3)
                    );
                  })
                  .map((item, idx) => {
                    const config =
                      TIME_SLOT_CONFIG[item.timeSlot] ||
                      TIME_SLOT_CONFIG.morning;
                    const Icon = config.icon;

                    return (
                      <div
                        key={item.id || idx}
                        className="flex gap-4 md:gap-6"
                      >
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center shrink-0">
                          <div
                            className={`w-12 h-12 rounded-full ${config.bg} flex items-center justify-center`}
                          >
                            <Icon size={20} className={config.color} />
                          </div>
                          {idx < (dayGroups[activeDay]?.length || 0) - 1 && (
                            <div className="w-0.5 flex-1 bg-cream-200 my-2" />
                          )}
                        </div>

                        {/* Activity card */}
                        <div className="flex-1 bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] overflow-hidden mb-2 hover:shadow-[0_4px_30px_rgba(0,0,0,0.08)] transition-shadow">
                          <div className="flex">
                            {/* Image */}
                            {item.listing?.image && (
                              <div className="w-32 md:w-40 shrink-0 bg-cream-200">
                                <img
                                  src={item.listing.image}
                                  alt={item.listing.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}

                            <div className="flex-1 p-4 md:p-5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span
                                    className={`text-xs font-semibold ${config.color} uppercase tracking-wide`}
                                  >
                                    {config.label}
                                  </span>
                                  <h3 className="font-bold text-navy-700 mt-1">
                                    {item.customTitle}
                                  </h3>
                                </div>
                                {item.listing && (
                                  <Link
                                    href={`/${item.listing.islandSlug}/${item.listing.slug}`}
                                    className="shrink-0 w-8 h-8 rounded-full bg-cream-50 flex items-center justify-center text-navy-400 hover:text-gold-500 hover:bg-gold-50 transition-colors"
                                    title="View listing"
                                  >
                                    <ExternalLink size={14} />
                                  </Link>
                                )}
                              </div>

                              {item.customNote && (
                                <p className="text-navy-400 text-sm mt-2">
                                  {item.customNote}
                                </p>
                              )}

                              {item.listing && (
                                <div className="flex items-center gap-3 mt-3">
                                  <span className="text-xs text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full font-medium capitalize">
                                    {item.listing.type}
                                  </span>
                                  {item.listing.avgRating &&
                                    parseFloat(item.listing.avgRating) > 0 && (
                                      <span className="flex items-center gap-1 text-xs text-gold-700 font-medium">
                                        <Star
                                          size={12}
                                          fill="currentColor"
                                        />
                                        {parseFloat(
                                          item.listing.avgRating
                                        ).toFixed(1)}
                                        {item.listing.reviewCount
                                          ? ` (${item.listing.reviewCount})`
                                          : ""}
                                      </span>
                                    )}
                                  {item.listing.priceAmount && (
                                    <span className="text-xs text-navy-500 font-medium">
                                      $
                                      {parseFloat(
                                        item.listing.priceAmount
                                      ).toFixed(0)}
                                      {item.listing.priceUnit
                                        ? `/${item.listing.priceUnit}`
                                        : ""}
                                    </span>
                                  )}
                                  {item.listing.parish && (
                                    <span className="flex items-center gap-1 text-xs text-navy-300">
                                      <MapPin size={10} />
                                      {item.listing.parish}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {/* Empty day */}
                {(!dayGroups[activeDay] ||
                  dayGroups[activeDay].length === 0) && (
                  <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] p-12 text-center">
                    <Calendar
                      size={32}
                      className="text-navy-200 mx-auto mb-3"
                    />
                    <p className="text-navy-400">
                      No activities planned for Day {activeDay} yet.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
