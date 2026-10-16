"use client";

import { useEffect, useLayoutEffect, useRef, useState, use, type RefObject } from "react";
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
  const { user } = useAuth();
  const context = `${user?.id || "guest"}:${id}`;
  const contextRef = useRef(context);
  useLayoutEffect(() => { contextRef.current = context; }, [context]);
  return <TripDetailContent key={context} id={id} contextRef={contextRef} />;
}

function TripDetailContent({ id, contextRef }: { id: string; contextRef: RefObject<string> }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const router = useRouter();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDay, setActiveDay] = useState(1);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [editTitle, setEditTitle] = useState("");
  const [action, setAction] = useState<"save" | "share" | "delete" | null>(null);
  const [actionError, setActionError] = useState("");
  const [shared, setShared] = useState(false);
  const [retry, setRetry] = useState(0);
  const actionRequest = useRef<AbortController | null>(null);
  const sharedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    const pending = actionRequest.current;
    actionRequest.current = null;
    pending?.abort();
    if (sharedTimer.current) clearTimeout(sharedTimer.current);
  }, []);

  useEffect(() => {
    setTrip(null); setItems([]); setError(""); setActionError(""); setLoading(true);
    if (authLoading) return;
    if (!userId) { setLoading(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let current = true;

    (async () => {
      try {
        const res = await fetch(`/api/trips/${id}`, { signal: controller.signal, cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!current || contextRef.current !== `${userId}:${id}`) return;
        if (controller.signal.aborted || !res.ok || data?.trip?.id !== id || typeof data.trip.title !== "string" || !Array.isArray(data.items)) throw new Error("Trip could not be loaded.");
        setTrip(data.trip);
        setItems(data.items);
        if (!editingRef.current) setEditTitle(data.trip.title);
      } catch {
        if (current && contextRef.current === `${userId}:${id}`) setError("This trip could not be loaded. It may be unavailable to this account. Try again or return to My Trips.");
      } finally {
        clearTimeout(timeout);
        if (current && contextRef.current === `${userId}:${id}`) setLoading(false);
      }
    })();
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [id, userId, authLoading, retry, contextRef]);

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

  async function performAction(nextAction: "save" | "share" | "delete") {
    if (!trip || !user || trip.userId !== user.id || actionRequest.current || contextRef.current !== `${user.id}:${id}`) return;
    if (nextAction === "save" && !editTitle.trim()) return;
    if (nextAction === "delete" && !confirm("Delete this trip? This cannot be undone.")) return;
    const controller = new AbortController();
    actionRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setAction(nextAction); setActionError(""); setShared(false);
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: nextAction === "delete" ? "DELETE" : "PATCH",
        ...(nextAction === "delete" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextAction === "share" ? { isPublic: true } : { title: editTitle.trim() }) }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (actionRequest.current !== controller || contextRef.current !== `${user.id}:${id}`) return;
      if (controller.signal.aborted || !res.ok) throw new Error("The change could not be confirmed.");
      if (nextAction === "delete") {
        if (data?.deleted !== true) throw new Error("Deletion could not be confirmed.");
        router.push("/trips"); return;
      }
      if (data?.trip?.id !== id || data.trip.userId !== user.id || typeof data.trip.title !== "string") throw new Error("The change could not be confirmed.");
      if (nextAction === "save") {
        setTrip(prev => prev ? { ...prev, title: data.trip.title } : prev);
        editingRef.current = false;
        setEditing(false);
      } else {
        if (data.trip.isPublic !== true) throw new Error("Sharing could not be confirmed.");
        setTrip(prev => prev ? { ...prev, isPublic: true } : prev);
        let onCopyAbort = () => {};
        try {
          const aborted = new Promise<never>((_resolve, reject) => {
            onCopyAbort = () => reject(new Error("Copy was interrupted."));
            controller.signal.addEventListener("abort", onCopyAbort, { once: true });
          });
          controller.signal.throwIfAborted();
          // A clipboard permission prompt does not consume the request signal.
          // Keep the shared action deadline effective while that promise waits.
          await Promise.race([navigator.clipboard.writeText(new URL(`/trips/${id}`, window.location.origin).href), aborted]);
        } catch {
          if (actionRequest.current === controller && contextRef.current === `${user.id}:${id}`) setActionError("This trip is shared, but its link could not be copied. Copy the trip address from your browser.");
          return;
        } finally {
          controller.signal.removeEventListener("abort", onCopyAbort);
        }
        if (actionRequest.current !== controller || contextRef.current !== `${user.id}:${id}` || controller.signal.aborted) return;
        setShared(true);
        if (sharedTimer.current) clearTimeout(sharedTimer.current);
        sharedTimer.current = setTimeout(() => setShared(false), 2000);
      }
    } catch {
      if (actionRequest.current === controller && contextRef.current === `${user.id}:${id}`) setActionError(nextAction === "share"
        ? "Sharing could not be confirmed. The link was not copied. Reload this trip before trying again."
        : "The change could not be confirmed. Your trip and title draft are kept. Reload the trip before trying again.");
    } finally {
      clearTimeout(timeout);
      if (actionRequest.current === controller && contextRef.current === `${user.id}:${id}`) { actionRequest.current = null; setAction(null); }
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", {
      timeZone: "UTC",
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
      timeZone: "UTC",
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
                href={`/auth/signin?next=${encodeURIComponent(`/trips/${id}`)}`}
                className="mt-4 bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-800 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Loading */}
          {(authLoading || (user && loading)) && (
            <div role="status" className="flex items-center justify-center py-24">
              <Loader2 aria-label="Loading trip" size={32} className="animate-spin text-gold-700" />
            </div>
          )}

          {/* Error */}
          {user && !authLoading && error && (
            <div className="flex flex-col items-center justify-center py-24">
              <p role="alert" className="text-red-500 mb-4">{error}</p>
              <button type="button" onClick={() => setRetry(value => value + 1)} className="mb-4 font-semibold text-gold-700 underline">Try loading trip again</button>
              <Link
                href="/trips"
                className="text-gold-700 hover:underline font-medium"
              >
                Go back to trips
              </Link>
            </div>
          )}

          {/* Trip detail */}
          {user && !authLoading && !loading && !error && trip && (
            <>
              {actionError && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700"><p>{actionError}</p><button type="button" disabled={action !== null} onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline disabled:opacity-50">Reload trip status</button></div>}
              {/* Trip header */}
              <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] overflow-hidden mb-8">
                <div className="h-2 bg-gradient-to-r from-gold-400 via-teal-400 to-gold-500" />
                <div className="p-6 md:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {editing ? (
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            aria-label="Trip title"
                            disabled={action !== null}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="text-2xl font-bold text-navy-700 bg-cream-50 rounded-xl px-3 py-1 focus:outline-none focus:ring-2 focus:ring-gold-400 flex-1"
                            style={{ fontFamily: "var(--font-display)" }}
                          />
                          <button
                            onClick={() => void performAction("save")}
                            disabled={action !== null}
                            aria-label="Save trip title"
                            className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center hover:bg-teal-600 transition-colors"
                          >
                            {action === "save" ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Check size={14} />
                            )}
                          </button>
                          <button
                            disabled={action !== null}
                            aria-label="Cancel title edit"
                            onClick={() => {
                              editingRef.current = false;
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
                    {trip.userId === user.id && <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void performAction("share")}
                        aria-label="Share trip"
                        disabled={action !== null}
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
                        onClick={() => { editingRef.current = true; setEditing(true); }}
                        disabled={action !== null}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-50 text-navy-500 hover:bg-cream-100 transition-colors text-sm font-medium"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => void performAction("delete")}
                        disabled={action !== null}
                        className="w-9 h-9 rounded-xl bg-cream-50 text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors flex items-center justify-center"
                        aria-label="Delete trip"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>}
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
