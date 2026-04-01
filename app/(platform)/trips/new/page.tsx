"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  ChevronRight,
  Sun,
  Cloud,
  Moon,
  Star,
  DollarSign,
  X,
} from "lucide-react";

type Island = {
  id: number;
  slug: string;
  name: string;
  country: string;
  listingCount: number;
};

type ItineraryItem = {
  id?: string;
  tripId?: string;
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

type Trip = {
  id: string;
  title: string;
};

const BUDGET_OPTIONS = [
  { value: "Budget", label: "Budget", icon: "$" },
  { value: "Mid-Range", label: "Mid-Range", icon: "$$" },
  { value: "Luxury", label: "Luxury", icon: "$$$" },
];

const INTEREST_OPTIONS = [
  "Beach",
  "Culture",
  "Adventure",
  "Food",
  "Nightlife",
  "Nature",
  "Relaxation",
  "Water Sports",
];

const TIME_SLOT_CONFIG: Record<string, { label: string; icon: typeof Sun; color: string; bg: string }> = {
  morning: { label: "Morning", icon: Sun, color: "text-gold-500", bg: "bg-gold-50" },
  afternoon: { label: "Afternoon", icon: Cloud, color: "text-teal-500", bg: "bg-teal-50" },
  evening: { label: "Evening", icon: Moon, color: "text-navy-500", bg: "bg-navy-50" },
};

export default function NewTripPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [islands, setIslands] = useState<Island[]>([]);
  const [islandId, setIslandId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [budget, setBudget] = useState("Mid-Range");
  const [interests, setInterests] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fetch islands
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/islands");
        if (!res.ok) return;
        const data = await res.json();
        setIslands(data.islands || []);
      } catch {
        /* silently fail */
      }
    })();
  }, []);

  const toggleInterest = useCallback((interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  }, []);

  const days =
    startDate && endDate
      ? Math.max(
          1,
          Math.ceil(
            (new Date(endDate).getTime() - new Date(startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  async function handleGenerate() {
    if (!islandId || !startDate || !endDate) {
      setError("Please select an island and your travel dates.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("End date must be after start date.");
      return;
    }

    setError("");
    setGenerating(true);
    setItinerary([]);
    setTrip(null);

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          islandId,
          startDate,
          endDate,
          guestCount,
          budget,
          interests,
          generateAI: true,
          title: `${islands.find((i) => i.id === islandId)?.name || "Island"} Adventure`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to generate itinerary");
        return;
      }

      const data = await res.json();
      setTrip(data.trip);
      setItinerary(data.items || []);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function handleViewTrip() {
    if (trip) {
      router.push(`/trips/${trip.id}`);
    }
  }

  // Group items by day
  const dayGroups = itinerary.reduce<Record<number, ItineraryItem[]>>(
    (acc, item) => {
      const d = item.dayNumber;
      if (!acc[d]) acc[d] = [];
      acc[d].push(item);
      return acc;
    },
    {}
  );

  const sortedDays = Object.keys(dayGroups)
    .map(Number)
    .sort((a, b) => a - b);

  const selectedIsland = islands.find((i) => i.id === islandId);

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
                Sign in to plan a trip
              </h2>
              <Link
                href="/auth/signin"
                className="mt-4 bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-600 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {user && (
            <>
              <h1
                className="text-3xl md:text-4xl font-bold text-navy-700 mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Plan Your Trip
              </h1>
              <p className="text-navy-400 mb-8">
                Tell us about your dream vacation and our AI will craft the
                perfect itinerary
              </p>

              {/* Form */}
              {!trip && (
                <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] p-6 md:p-8 space-y-6">
                  {/* Island selector */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">
                      <MapPin size={14} className="inline mr-1.5 text-gold-500" />
                      Destination
                    </label>
                    <select
                      value={islandId || ""}
                      onChange={(e) => setIslandId(Number(e.target.value) || null)}
                      className="w-full rounded-xl bg-cream-50 px-4 py-3 text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-all appearance-none"
                    >
                      <option value="">Select an island...</option>
                      {islands.map((island) => (
                        <option key={island.id} value={island.id}>
                          {island.name}, {island.country} ({island.listingCount}{" "}
                          listings)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy-600 mb-2">
                        <Calendar size={14} className="inline mr-1.5 text-gold-500" />
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full rounded-xl bg-cream-50 px-4 py-3 text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy-600 mb-2">
                        <Calendar size={14} className="inline mr-1.5 text-gold-500" />
                        End Date
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate || new Date().toISOString().split("T")[0]}
                        className="w-full rounded-xl bg-cream-50 px-4 py-3 text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-all"
                      />
                    </div>
                  </div>

                  {days > 0 && (
                    <p className="text-sm text-teal-600 font-medium -mt-2">
                      {days} day{days !== 1 ? "s" : ""} trip
                    </p>
                  )}

                  {/* Guest count */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">
                      <Users size={14} className="inline mr-1.5 text-gold-500" />
                      Guests
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                        className="w-10 h-10 rounded-xl bg-cream-50 text-navy-600 font-bold hover:bg-cream-100 transition-colors flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-lg font-semibold text-navy-700 w-8 text-center">
                        {guestCount}
                      </span>
                      <button
                        onClick={() => setGuestCount(Math.min(20, guestCount + 1))}
                        className="w-10 h-10 rounded-xl bg-cream-50 text-navy-600 font-bold hover:bg-cream-100 transition-colors flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Budget */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">
                      <DollarSign size={14} className="inline mr-1.5 text-gold-500" />
                      Budget
                    </label>
                    <div className="flex gap-3">
                      {BUDGET_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setBudget(opt.value)}
                          className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                            budget === opt.value
                              ? "bg-gradient-to-r from-gold-500 to-gold-600 text-white shadow-lg shadow-gold-500/25"
                              : "bg-cream-50 text-navy-500 hover:bg-cream-100"
                          }`}
                        >
                          <span className="block text-xs opacity-70">
                            {opt.icon}
                          </span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interests */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">
                      <Sparkles size={14} className="inline mr-1.5 text-gold-500" />
                      Interests
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {INTEREST_OPTIONS.map((interest) => (
                        <button
                          key={interest}
                          onClick={() => toggleInterest(interest)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            interests.includes(interest)
                              ? "bg-teal-500 text-white shadow-md shadow-teal-500/25"
                              : "bg-cream-50 text-navy-500 hover:bg-cream-100"
                          }`}
                        >
                          {interest}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">
                      <X size={16} />
                      {error}
                    </div>
                  )}

                  {/* Generate button */}
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-gold-500 via-gold-600 to-teal-500 text-white hover:from-gold-600 hover:via-gold-700 hover:to-teal-600 transition-all shadow-lg shadow-gold-500/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {generating ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Generating Your Itinerary...
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        Generate Itinerary
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Loading animation */}
              {generating && (
                <div className="mt-10 flex flex-col items-center py-12">
                  <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-gold-400 to-teal-400 animate-spin" style={{ animationDuration: "3s" }} />
                    <div className="absolute inset-1 rounded-full bg-cream-50 flex items-center justify-center">
                      <Sparkles size={32} className="text-gold-500 animate-pulse" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-navy-700 mb-2">
                    Crafting your perfect trip...
                  </h3>
                  <p className="text-navy-400 text-center max-w-md">
                    Our AI is analyzing {selectedIsland?.name || "island"}{" "}
                    listings, checking availability, and building a personalized
                    day-by-day itinerary just for you.
                  </p>
                </div>
              )}

              {/* Result: Itinerary */}
              {!generating && itinerary.length > 0 && trip && (
                <div className="mt-10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2
                        className="text-2xl font-bold text-navy-700"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        Your Itinerary
                      </h2>
                      <p className="text-navy-400 text-sm mt-1">
                        {days} day{days !== 1 ? "s" : ""} in{" "}
                        {selectedIsland?.name} for {guestCount} guest
                        {guestCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      onClick={handleViewTrip}
                      className="flex items-center gap-2 bg-gradient-to-r from-gold-500 to-gold-600 text-white px-5 py-3 rounded-2xl font-semibold hover:from-gold-600 hover:to-gold-700 transition-all shadow-lg shadow-gold-500/25"
                    >
                      View Trip
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {/* Day by day */}
                  <div className="space-y-6">
                    {sortedDays.map((dayNum) => (
                      <div
                        key={dayNum}
                        className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] overflow-hidden"
                      >
                        <div className="bg-gradient-to-r from-navy-700 to-navy-800 px-6 py-4">
                          <h3 className="text-white font-bold text-lg">
                            Day {dayNum}
                          </h3>
                          {startDate && (
                            <p className="text-navy-200 text-sm">
                              {new Date(
                                new Date(startDate).getTime() +
                                  (dayNum - 1) * 86400000
                              ).toLocaleDateString("en-US", {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>

                        <div className="p-6 space-y-4">
                          {(dayGroups[dayNum] || [])
                            .sort((a, b) => {
                              const order = { morning: 0, afternoon: 1, evening: 2 };
                              return (
                                (order[a.timeSlot as keyof typeof order] ?? 3) -
                                (order[b.timeSlot as keyof typeof order] ?? 3)
                              );
                            })
                            .map((item, idx) => {
                              const config = TIME_SLOT_CONFIG[item.timeSlot] || TIME_SLOT_CONFIG.morning;
                              const Icon = config.icon;

                              return (
                                <div key={idx} className="flex gap-4">
                                  {/* Time slot badge */}
                                  <div
                                    className={`shrink-0 w-24 flex flex-col items-center justify-center rounded-xl ${config.bg} py-3`}
                                  >
                                    <Icon size={20} className={config.color} />
                                    <span
                                      className={`text-xs font-semibold mt-1 ${config.color}`}
                                    >
                                      {config.label}
                                    </span>
                                  </div>

                                  {/* Activity card */}
                                  <div className="flex-1 bg-cream-50 rounded-xl p-4 hover:bg-cream-100 transition-colors">
                                    <div className="flex items-start gap-3">
                                      {/* Image */}
                                      {item.listing?.image && (
                                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-cream-200">
                                          <img
                                            src={item.listing.image}
                                            alt={item.listing.title}
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                      )}

                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-navy-700 text-sm">
                                          {item.customTitle}
                                        </h4>
                                        {item.customNote && (
                                          <p className="text-navy-400 text-xs mt-1 line-clamp-2">
                                            {item.customNote}
                                          </p>
                                        )}
                                        {item.listing && (
                                          <div className="flex items-center gap-3 mt-2">
                                            <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full font-medium capitalize">
                                              {item.listing.type}
                                            </span>
                                            {item.listing.avgRating &&
                                              parseFloat(item.listing.avgRating) > 0 && (
                                                <span className="flex items-center gap-0.5 text-xs text-gold-600">
                                                  <Star
                                                    size={10}
                                                    fill="currentColor"
                                                  />
                                                  {parseFloat(
                                                    item.listing.avgRating
                                                  ).toFixed(1)}
                                                </span>
                                              )}
                                            {item.listing.priceAmount && (
                                              <span className="text-xs text-navy-400">
                                                $
                                                {parseFloat(
                                                  item.listing.priceAmount
                                                ).toFixed(0)}
                                                {item.listing.priceUnit
                                                  ? `/${item.listing.priceUnit}`
                                                  : ""}
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
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
