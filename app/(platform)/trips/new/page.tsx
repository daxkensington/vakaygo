"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  ArrowRight,
  ChevronRight,
  Sun,
  Cloud,
  Moon,
  Star,
  DollarSign,
  X,
  Share2,
  Bookmark,
  ShoppingCart,
  Printer,
  RefreshCw,
  Check,
  Palmtree,
  Compass,
  Utensils,
  Music,
  Camera,
  Mountain,
  Heart,
  Baby,
  Waves,
  ShoppingBag,
  Landmark,
  Leaf,
  Zap,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────

type Island = {
  id: number;
  slug: string;
  name: string;
  country: string;
  listingCount: number;
};

type ItineraryItem = {
  timeSlot: string;
  type: string;
  title: string;
  listingId: string | null;
  listingSlug: string | null;
  listingTitle: string | null;
  price: number | null;
  rating: number | null;
  image: string | null;
  note: string | null;
};

type ItineraryDay = {
  dayNumber: number;
  date: string;
  theme: string;
  items: ItineraryItem[];
};

type GeneratedItinerary = {
  title: string;
  summary: string;
  estimatedBudget: {
    accommodation: number;
    activities: number;
    dining: number;
    transport: number;
    total: number;
  };
  days: ItineraryDay[];
};

type Trip = {
  id: string;
  title: string;
};

// ─── Constants ─────────────────────────────────────────────────

const BUDGET_OPTIONS = [
  {
    value: "Budget",
    label: "Budget",
    icon: "$",
    desc: "Under $100/day",
    color: "from-emerald-400 to-emerald-500",
  },
  {
    value: "Mid-Range",
    label: "Mid-Range",
    icon: "$$",
    desc: "$100-250/day",
    color: "from-gold-400 to-gold-500",
  },
  {
    value: "Luxury",
    label: "Luxury",
    icon: "$$$",
    desc: "$250+/day",
    color: "from-purple-400 to-purple-500",
  },
];

const PACE_OPTIONS = [
  {
    value: "relaxed",
    label: "Relaxed",
    desc: "Plenty of free time, no rush",
    emoji: "🌴",
  },
  {
    value: "moderate",
    label: "Moderate",
    desc: "Good mix of activities & downtime",
    emoji: "⚖️",
  },
  {
    value: "active",
    label: "Active",
    desc: "Packed schedule, see it all",
    emoji: "🚀",
  },
];

const INTEREST_OPTIONS: { label: string; icon: typeof Palmtree }[] = [
  { label: "Beach", icon: Palmtree },
  { label: "Snorkeling", icon: Waves },
  { label: "Hiking", icon: Mountain },
  { label: "Culture", icon: Landmark },
  { label: "Nightlife", icon: Music },
  { label: "Food", icon: Utensils },
  { label: "Shopping", icon: ShoppingBag },
  { label: "History", icon: Compass },
  { label: "Nature", icon: Leaf },
  { label: "Romance", icon: Heart },
  { label: "Family", icon: Baby },
  { label: "Adventure", icon: Zap },
];

const TIME_SLOT_CONFIG: Record<
  string,
  { label: string; icon: typeof Sun; color: string; bg: string }
> = {
  morning: {
    label: "Morning",
    icon: Sun,
    color: "text-gold-500",
    bg: "bg-gold-50",
  },
  afternoon: {
    label: "Afternoon",
    icon: Cloud,
    color: "text-teal-500",
    bg: "bg-teal-50",
  },
  evening: {
    label: "Evening",
    icon: Moon,
    color: "text-navy-500",
    bg: "bg-navy-50",
  },
};

const TYPE_COLORS: Record<string, string> = {
  stay: "bg-purple-100 text-purple-700",
  tour: "bg-teal-100 text-teal-700",
  dining: "bg-gold-100 text-gold-700",
  event: "bg-pink-100 text-pink-700",
  excursion: "bg-emerald-100 text-emerald-700",
  transport: "bg-blue-100 text-blue-700",
  transfer: "bg-blue-100 text-blue-700",
  free: "bg-cream-200 text-navy-500",
  vip: "bg-gold-200 text-gold-800",
};

const PROGRESS_MESSAGES = [
  "Searching for the best stays...",
  "Finding top-rated restaurants...",
  "Discovering unique tours & excursions...",
  "Checking availability for your dates...",
  "Matching activities to your interests...",
  "Optimizing your daily schedule...",
  "Balancing your budget across the trip...",
  "Adding local insider tips...",
  "Finalizing your perfect itinerary...",
];

// ─── Component ─────────────────────────────────────────────────

export default function NewTripPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Wizard step
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  // Step 1: Basics
  const [islandsData, setIslandsData] = useState<Island[]>([]);
  const [islandId, setIslandId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [guestCount, setGuestCount] = useState(2);

  // Step 2: Preferences
  const [budget, setBudget] = useState("Mid-Range");
  const [pace, setPace] = useState("moderate");
  const [interests, setInterests] = useState<string[]>([]);

  // Step 3: Special requests
  const [specialRequests, setSpecialRequests] = useState("");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Results
  const [itinerary, setItinerary] = useState<GeneratedItinerary | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Fetch islands
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/islands");
        if (!res.ok) return;
        const data = await res.json();
        setIslandsData(data.islands || []);
      } catch {
        /* silently fail */
      }
    })();
  }, []);

  // Progress animation
  useEffect(() => {
    if (generating) {
      setProgressIdx(0);
      setProgressPercent(0);
      progressInterval.current = setInterval(() => {
        setProgressIdx((prev) => {
          if (prev < PROGRESS_MESSAGES.length - 1) return prev + 1;
          return prev;
        });
        setProgressPercent((prev) => Math.min(prev + Math.random() * 8 + 2, 92));
      }, 2500);
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      if (itinerary) {
        setProgressPercent(100);
      }
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [generating, itinerary]);

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

  const selectedIsland = islandsData.find((i) => i.id === islandId);

  // Validation
  const canProceedStep1 = islandId && startDate && endDate && days > 0 && new Date(endDate) > new Date(startDate);
  const canProceedStep2 = budget && pace;

  function handleNext() {
    if (step < totalSteps) setStep(step + 1);
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  async function handleGenerate() {
    if (!islandId || !startDate || !endDate) {
      setError("Please select an island and your travel dates.");
      return;
    }

    setError("");
    setGenerating(true);
    setItinerary(null);
    setTrip(null);

    try {
      const res = await fetch("/api/trips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          islandId,
          startDate,
          endDate,
          guestCount,
          budget,
          pace,
          interests,
          specialRequests,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to generate itinerary");
        return;
      }

      const data = await res.json();
      setTrip(data.trip);
      setItinerary(data.itinerary);
      setStep(4); // Results step
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function handleViewTrip() {
    if (trip) router.push(`/trips/${trip.id}`);
  }

  async function handleShare() {
    const url = trip ? `${window.location.origin}/trips/${trip.id}` : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleStartOver() {
    setStep(1);
    setItinerary(null);
    setTrip(null);
    setError("");
  }

  // Budget totals from itinerary
  const budgetData = itinerary?.estimatedBudget;

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen print:pt-0 print:bg-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          {/* Back link */}
          <Link
            href="/trips"
            className="inline-flex items-center gap-1.5 text-sm text-navy-400 hover:text-gold-600 transition-colors mb-6 print:hidden"
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

          {user && !generating && step <= totalSteps && !itinerary && (
            <>
              {/* Title */}
              <h1
                className="text-3xl md:text-4xl font-bold text-navy-700 mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Plan Your Dream Trip
              </h1>
              <p className="text-navy-400 mb-8">
                Our AI agent will search real listings and craft a personalized
                day-by-day itinerary
              </p>

              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-8">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (s < step) setStep(s);
                      }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        s === step
                          ? "bg-gradient-to-r from-gold-500 to-gold-600 text-white shadow-lg shadow-gold-500/25"
                          : s < step
                            ? "bg-teal-500 text-white cursor-pointer"
                            : "bg-cream-200 text-navy-400"
                      }`}
                    >
                      {s < step ? <Check size={16} /> : s}
                    </button>
                    {s < 3 && (
                      <div
                        className={`w-12 sm:w-20 h-1 rounded-full transition-all ${
                          s < step ? "bg-teal-500" : "bg-cream-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
                <span className="ml-3 text-sm text-navy-400">
                  {step === 1 && "Basics"}
                  {step === 2 && "Preferences"}
                  {step === 3 && "Final Details"}
                </span>
              </div>

              {/* ─── Step 1: Basics ──────────────────────────── */}
              {step === 1 && (
                <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] p-6 md:p-8 space-y-6">
                  {/* Island selector */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-3">
                      <MapPin
                        size={14}
                        className="inline mr-1.5 text-gold-500"
                      />
                      Where do you want to go?
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {islandsData.map((island) => (
                        <button
                          key={island.id}
                          onClick={() => setIslandId(island.id)}
                          className={`relative p-4 rounded-xl text-left transition-all ${
                            islandId === island.id
                              ? "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/25"
                              : "bg-cream-50 text-navy-600 hover:bg-cream-100"
                          }`}
                        >
                          <span className="block font-semibold text-sm truncate">
                            {island.name}
                          </span>
                          <span
                            className={`block text-xs mt-1 ${
                              islandId === island.id
                                ? "text-teal-100"
                                : "text-navy-400"
                            }`}
                          >
                            {island.country}
                          </span>
                          <span
                            className={`block text-xs mt-0.5 ${
                              islandId === island.id
                                ? "text-teal-200"
                                : "text-navy-300"
                            }`}
                          >
                            {island.listingCount} listings
                          </span>
                          {islandId === island.id && (
                            <div className="absolute top-2 right-2">
                              <Check size={16} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy-600 mb-2">
                        <Calendar
                          size={14}
                          className="inline mr-1.5 text-gold-500"
                        />
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
                        <Calendar
                          size={14}
                          className="inline mr-1.5 text-gold-500"
                        />
                        End Date
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={
                          startDate || new Date().toISOString().split("T")[0]
                        }
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
                      <Users
                        size={14}
                        className="inline mr-1.5 text-gold-500"
                      />
                      Guests
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setGuestCount(Math.max(1, guestCount - 1))
                        }
                        className="w-10 h-10 rounded-xl bg-cream-50 text-navy-600 font-bold hover:bg-cream-100 transition-colors flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-lg font-semibold text-navy-700 w-8 text-center">
                        {guestCount}
                      </span>
                      <button
                        onClick={() =>
                          setGuestCount(Math.min(20, guestCount + 1))
                        }
                        className="w-10 h-10 rounded-xl bg-cream-50 text-navy-600 font-bold hover:bg-cream-100 transition-colors flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Next button */}
                  <button
                    onClick={handleNext}
                    disabled={!canProceedStep1}
                    className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-gold-500 to-gold-600 text-white hover:from-gold-600 hover:to-gold-700 transition-all shadow-lg shadow-gold-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    Continue
                    <ArrowRight size={20} />
                  </button>
                </div>
              )}

              {/* ─── Step 2: Preferences ─────────────────────── */}
              {step === 2 && (
                <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] p-6 md:p-8 space-y-6">
                  {/* Budget */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-3">
                      <DollarSign
                        size={14}
                        className="inline mr-1.5 text-gold-500"
                      />
                      Budget Level
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {BUDGET_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setBudget(opt.value)}
                          className={`relative p-5 rounded-xl text-left transition-all ${
                            budget === opt.value
                              ? `bg-gradient-to-br ${opt.color} text-white shadow-lg`
                              : "bg-cream-50 text-navy-600 hover:bg-cream-100"
                          }`}
                        >
                          <span
                            className={`block text-2xl font-bold mb-1 ${
                              budget === opt.value ? "text-white" : "text-navy-300"
                            }`}
                          >
                            {opt.icon}
                          </span>
                          <span className="block font-semibold">{opt.label}</span>
                          <span
                            className={`block text-xs mt-1 ${
                              budget === opt.value
                                ? "text-white/80"
                                : "text-navy-400"
                            }`}
                          >
                            {opt.desc}
                          </span>
                          {budget === opt.value && (
                            <div className="absolute top-3 right-3">
                              <Check size={16} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pace */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-3">
                      <Compass
                        size={14}
                        className="inline mr-1.5 text-gold-500"
                      />
                      Trip Pace
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {PACE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPace(opt.value)}
                          className={`p-5 rounded-xl text-left transition-all ${
                            pace === opt.value
                              ? "bg-gradient-to-br from-navy-600 to-navy-700 text-white shadow-lg"
                              : "bg-cream-50 text-navy-600 hover:bg-cream-100"
                          }`}
                        >
                          <span className="block text-2xl mb-1">{opt.emoji}</span>
                          <span className="block font-semibold">{opt.label}</span>
                          <span
                            className={`block text-xs mt-1 ${
                              pace === opt.value
                                ? "text-navy-200"
                                : "text-navy-400"
                            }`}
                          >
                            {opt.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interests */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-3">
                      <Sparkles
                        size={14}
                        className="inline mr-1.5 text-gold-500"
                      />
                      Interests (pick as many as you like)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {INTEREST_OPTIONS.map(({ label, icon: Icon }) => (
                        <button
                          key={label}
                          onClick={() => toggleInterest(label)}
                          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                            interests.includes(label)
                              ? "bg-teal-500 text-white shadow-md shadow-teal-500/25"
                              : "bg-cream-50 text-navy-500 hover:bg-cream-100"
                          }`}
                        >
                          <Icon size={16} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Nav buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleBack}
                      className="flex-1 py-4 rounded-2xl font-bold text-lg bg-cream-100 text-navy-600 hover:bg-cream-200 transition-all flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={20} />
                      Back
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!canProceedStep2}
                      className="flex-[2] py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-gold-500 to-gold-600 text-white hover:from-gold-600 hover:to-gold-700 transition-all shadow-lg shadow-gold-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      Continue
                      <ArrowRight size={20} />
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Step 3: Special Requests & Generate ─────── */}
              {step === 3 && (
                <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] p-6 md:p-8 space-y-6">
                  {/* Summary of selections */}
                  <div className="bg-cream-50 rounded-xl p-5 space-y-3">
                    <h3 className="font-semibold text-navy-700 text-sm">
                      Trip Summary
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-navy-400">Destination:</span>{" "}
                        <span className="font-medium text-navy-700">
                          {selectedIsland?.name}
                        </span>
                      </div>
                      <div>
                        <span className="text-navy-400">Duration:</span>{" "}
                        <span className="font-medium text-navy-700">
                          {days} day{days !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div>
                        <span className="text-navy-400">Guests:</span>{" "}
                        <span className="font-medium text-navy-700">
                          {guestCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-navy-400">Budget:</span>{" "}
                        <span className="font-medium text-navy-700">
                          {budget}
                        </span>
                      </div>
                      <div>
                        <span className="text-navy-400">Pace:</span>{" "}
                        <span className="font-medium text-navy-700 capitalize">
                          {pace}
                        </span>
                      </div>
                      {interests.length > 0 && (
                        <div className="col-span-2">
                          <span className="text-navy-400">Interests:</span>{" "}
                          <span className="font-medium text-navy-700">
                            {interests.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Special requests */}
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">
                      <Camera
                        size={14}
                        className="inline mr-1.5 text-gold-500"
                      />
                      Anything else we should know?
                    </label>
                    <textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      placeholder="Dietary needs, mobility considerations, celebrating a birthday, prefer boutique hotels, want to see sea turtles..."
                      rows={4}
                      className="w-full rounded-xl bg-cream-50 px-4 py-3 text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-all resize-none"
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">
                      <X size={16} />
                      {error}
                    </div>
                  )}

                  {/* Nav buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleBack}
                      className="flex-1 py-4 rounded-2xl font-bold text-lg bg-cream-100 text-navy-600 hover:bg-cream-200 transition-all flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={20} />
                      Back
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex-[2] py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-gold-500 via-gold-600 to-teal-500 text-white hover:from-gold-600 hover:via-gold-700 hover:to-teal-600 transition-all shadow-lg shadow-gold-500/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Sparkles size={20} />
                      Generate My Trip
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── Loading State ──────────────────────────────── */}
          {user && generating && (
            <div className="mt-4">
              <h1
                className="text-3xl md:text-4xl font-bold text-navy-700 mb-8 text-center"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Crafting Your Perfect Trip
              </h1>

              {/* Progress bar */}
              <div className="max-w-md mx-auto mb-8">
                <div className="h-2 bg-cream-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gold-500 to-teal-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-sm text-navy-400 text-center mt-3">
                  {PROGRESS_MESSAGES[progressIdx]}
                </p>
              </div>

              {/* Animated spinner */}
              <div className="flex justify-center mb-8">
                <div className="relative w-24 h-24">
                  <div
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-gold-400 to-teal-400 animate-spin"
                    style={{ animationDuration: "3s" }}
                  />
                  <div className="absolute inset-1 rounded-full bg-cream-50 flex items-center justify-center">
                    <Sparkles
                      size={32}
                      className="text-gold-500 animate-pulse"
                    />
                  </div>
                </div>
              </div>

              {/* Skeleton itinerary */}
              <div className="space-y-4 max-w-2xl mx-auto">
                {[1, 2, 3].map((d) => (
                  <div
                    key={d}
                    className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] overflow-hidden animate-pulse"
                  >
                    <div className="bg-navy-100 h-14" />
                    <div className="p-5 space-y-4">
                      {[1, 2, 3].map((s) => (
                        <div key={s} className="flex gap-4">
                          <div className="w-20 h-16 bg-cream-200 rounded-lg shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-cream-200 rounded w-3/4" />
                            <div className="h-3 bg-cream-100 rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-center text-navy-300 text-sm mt-8">
                This usually takes 15-30 seconds. Our AI is searching through
                real listings...
              </p>
            </div>
          )}

          {/* ─── Step 4: Results ────────────────────────────── */}
          {user && !generating && itinerary && trip && step === 4 && (
            <div className="print:mt-0">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
                <div>
                  <h1
                    className="text-3xl md:text-4xl font-bold text-navy-700"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {itinerary.title}
                  </h1>
                  <p className="text-navy-400 mt-2 max-w-2xl">
                    {itinerary.summary}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-3 text-sm text-navy-500">
                    <span className="flex items-center gap-1">
                      <MapPin size={14} className="text-gold-500" />
                      {selectedIsland?.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={14} className="text-gold-500" />
                      {days} day{days !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={14} className="text-gold-500" />
                      {guestCount} guest{guestCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 print:hidden shrink-0">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cream-100 text-navy-600 hover:bg-cream-200 transition-all text-sm font-medium"
                  >
                    {copied ? <Check size={16} /> : <Share2 size={16} />}
                    {copied ? "Copied!" : "Share"}
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cream-100 text-navy-600 hover:bg-cream-200 transition-all text-sm font-medium"
                  >
                    <Printer size={16} />
                    Print
                  </button>
                  <button
                    onClick={handleViewTrip}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 text-white hover:from-gold-600 hover:to-gold-700 transition-all text-sm font-semibold shadow-lg shadow-gold-500/25"
                  >
                    <Bookmark size={16} />
                    View Saved Trip
                  </button>
                </div>
              </div>

              {/* Layout: Itinerary + Budget sidebar */}
              <div className="flex flex-col lg:flex-row gap-6 mt-8">
                {/* Main itinerary */}
                <div className="flex-1 space-y-6">
                  {itinerary.days.map((day) => (
                    <div
                      key={day.dayNumber}
                      className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] overflow-hidden"
                    >
                      {/* Day header */}
                      <div className="bg-gradient-to-r from-navy-700 to-navy-800 px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white font-bold text-lg">
                              Day {day.dayNumber}
                              {day.theme && (
                                <span className="font-normal text-navy-200 ml-2">
                                  &mdash; {day.theme}
                                </span>
                              )}
                            </h3>
                            {day.date && (
                              <p className="text-navy-200 text-sm">
                                {new Date(day.date + "T12:00:00").toLocaleDateString(
                                  "en-US",
                                  {
                                    weekday: "long",
                                    month: "long",
                                    day: "numeric",
                                  }
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="p-5 space-y-4">
                        {day.items
                          .sort((a, b) => {
                            const order: Record<string, number> = {
                              morning: 0,
                              afternoon: 1,
                              evening: 2,
                            };
                            return (
                              (order[a.timeSlot] ?? 3) -
                              (order[b.timeSlot] ?? 3)
                            );
                          })
                          .map((item, idx) => {
                            const slotConfig =
                              TIME_SLOT_CONFIG[item.timeSlot] ||
                              TIME_SLOT_CONFIG.morning;
                            const SlotIcon = slotConfig.icon;
                            const typeColor =
                              TYPE_COLORS[item.type] || TYPE_COLORS.free;

                            const isLinked = item.listingId && item.listingSlug;

                            const cardContent = (
                              <div className="flex gap-4">
                                {/* Time slot badge */}
                                <div
                                  className={`shrink-0 w-20 flex flex-col items-center justify-center rounded-xl ${slotConfig.bg} py-3`}
                                >
                                  <SlotIcon
                                    size={18}
                                    className={slotConfig.color}
                                  />
                                  <span
                                    className={`text-xs font-semibold mt-1 ${slotConfig.color}`}
                                  >
                                    {slotConfig.label}
                                  </span>
                                </div>

                                {/* Activity card */}
                                <div
                                  className={`flex-1 bg-cream-50 rounded-xl p-4 transition-colors ${
                                    isLinked
                                      ? "hover:bg-cream-100 cursor-pointer"
                                      : ""
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {/* Image */}
                                    {item.image && (
                                      <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-cream-200">
                                        <img
                                          src={item.image}
                                          alt={item.title}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    )}

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-semibold text-navy-700 text-sm">
                                          {item.title}
                                        </h4>
                                      </div>

                                      {item.note && (
                                        <p className="text-navy-400 text-xs mt-1 line-clamp-2">
                                          {item.note}
                                        </p>
                                      )}

                                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        <span
                                          className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${typeColor}`}
                                        >
                                          {item.type}
                                        </span>

                                        {item.rating != null &&
                                          item.rating > 0 && (
                                            <span className="flex items-center gap-0.5 text-xs text-gold-600">
                                              <Star
                                                size={10}
                                                fill="currentColor"
                                              />
                                              {Number(item.rating).toFixed(1)}
                                            </span>
                                          )}

                                        {item.price != null &&
                                          item.price > 0 && (
                                            <span className="text-xs text-navy-400">
                                              ${Number(item.price).toFixed(0)}
                                            </span>
                                          )}

                                        {item.listingTitle &&
                                          item.listingTitle !== item.title && (
                                            <span className="text-xs text-teal-600 truncate max-w-[140px]">
                                              {item.listingTitle}
                                            </span>
                                          )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );

                            if (isLinked && selectedIsland) {
                              return (
                                <Link
                                  key={idx}
                                  href={`/${selectedIsland.slug}/${item.listingSlug}`}
                                  className="block"
                                >
                                  {cardContent}
                                </Link>
                              );
                            }

                            return (
                              <div key={idx}>{cardContent}</div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Budget sidebar */}
                <div className="lg:w-72 shrink-0 space-y-4">
                  {/* Budget card */}
                  {budgetData && (
                    <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] p-5 sticky top-24">
                      <h3 className="font-bold text-navy-700 mb-4 flex items-center gap-2">
                        <DollarSign size={16} className="text-gold-500" />
                        Estimated Budget
                      </h3>

                      <div className="space-y-3">
                        {[
                          {
                            label: "Accommodation",
                            value: budgetData.accommodation,
                            color: "bg-purple-400",
                          },
                          {
                            label: "Activities",
                            value: budgetData.activities,
                            color: "bg-teal-400",
                          },
                          {
                            label: "Dining",
                            value: budgetData.dining,
                            color: "bg-gold-400",
                          },
                          {
                            label: "Transport",
                            value: budgetData.transport,
                            color: "bg-blue-400",
                          },
                        ].map((cat) => (
                          <div key={cat.label}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-navy-500">{cat.label}</span>
                              <span className="font-medium text-navy-700">
                                ${(cat.value || 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="h-1.5 bg-cream-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${cat.color} rounded-full`}
                                style={{
                                  width: `${
                                    budgetData.total > 0
                                      ? ((cat.value || 0) /
                                          budgetData.total) *
                                        100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 pt-4 border-t border-cream-200">
                        <div className="flex justify-between">
                          <span className="font-bold text-navy-700">Total</span>
                          <span className="font-bold text-navy-700 text-lg">
                            ${(budgetData.total || 0).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-navy-400 mt-1">
                          For {guestCount} guest{guestCount !== 1 ? "s" : ""},{" "}
                          {days} day{days !== 1 ? "s" : ""}
                        </p>
                      </div>

                      {/* Action buttons in sidebar */}
                      <div className="mt-5 space-y-2 print:hidden">
                        <div className="relative group">
                          <button
                            disabled
                            className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-teal-500 to-teal-600 text-white opacity-60 cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            <ShoppingCart size={16} />
                            Book All
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-navy-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                            Coming soon
                          </div>
                        </div>

                        <button
                          onClick={handleStartOver}
                          className="w-full py-3 rounded-xl font-semibold text-sm bg-cream-100 text-navy-600 hover:bg-cream-200 transition-all flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={16} />
                          Plan Another Trip
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error display at any time */}
          {error && !generating && step <= totalSteps && (
            <div className="mt-4 flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">
              <X size={16} />
              {error}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
