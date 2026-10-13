"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useAuth } from "@/lib/auth-context";
import {
  MapPin,
  Calendar,
  Users,
  Sparkles,
  Plus,
  Loader2,
  Trash2,
  Plane,
} from "lucide-react";

type Trip = {
  id: string;
  title: string;
  islandName: string | null;
  islandSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  guestCount: number;
  budget: string | null;
  isAiGenerated: boolean;
  itemCount: number;
  createdAt: string;
};

export default function TripsPage() {
  const { user } = useAuth();
  const actorRef = useRef(user?.id);
  useLayoutEffect(() => { actorRef.current = user?.id; }, [user?.id]);
  return <TripsContent key={user?.id || "guest"} actorRef={actorRef} />;
}

function TripsContent({ actorRef }: { actorRef: RefObject<string | undefined> }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const deletionRequest = useRef<AbortController | null>(null);

  useEffect(() => () => {
    const pending = deletionRequest.current;
    deletionRequest.current = null;
    pending?.abort();
  }, []);

  useEffect(() => {
    setTrips([]); setError(""); setLoading(true);
    if (authLoading) return;
    if (!userId) { setLoading(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let current = true;

    (async () => {
      try {
        const res = await fetch("/api/trips", { signal: controller.signal, cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!current || actorRef.current !== userId) return;
        if (controller.signal.aborted || !res.ok || !Array.isArray(data?.trips)) throw new Error("Trips could not be loaded. Please try again.");
        setTrips(data.trips);
      } catch {
        if (current && actorRef.current === userId) setError("Trips could not be loaded. Please try again.");
      } finally {
        clearTimeout(timeout);
        if (current && actorRef.current === userId) setLoading(false);
      }
    })();
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [userId, authLoading, retry, actorRef]);

  async function handleDelete(id: string) {
    if (deletionRequest.current || !user || actorRef.current !== user.id) return;
    if (!confirm("Delete this trip?")) return;
    const controller = new AbortController();
    deletionRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setError("");
    setDeleting(id);
    try {
      const res = await fetch(`/api/trips/${id}`, { method: "DELETE", signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (deletionRequest.current !== controller || actorRef.current !== user.id) return;
      if (controller.signal.aborted || !res.ok || data?.deleted !== true) throw new Error("Deletion could not be confirmed.");
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } catch {
      if (deletionRequest.current === controller && actorRef.current === user.id) setError("Deletion could not be confirmed. Refresh your trips before trying again.");
    } finally {
      clearTimeout(timeout);
      if (deletionRequest.current === controller && actorRef.current === user.id) { deletionRequest.current = null; setDeleting(null); }
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

  function getDays(start: string | null, end: string | null) {
    if (!start || !end) return 0;
    return Math.max(
      1,
      Math.ceil(
        (new Date(end).getTime() - new Date(start).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
  }

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-10">
          {/* Breadcrumbs */}
          <div className="mb-6">
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "My Trips" },
              ]}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1
                className="text-3xl md:text-4xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                My Trips
              </h1>
              <p className="text-navy-400 mt-1">
                Plan, organize, and explore your dream vacations
              </p>
            </div>
            {user && (
              <Link
                href="/trips/new"
                className="flex items-center gap-2 bg-gradient-to-r from-gold-700 to-gold-800 text-white px-5 py-3 rounded-2xl font-semibold hover:from-gold-800 hover:to-gold-900 transition-all shadow-lg shadow-gold-500/25"
              >
                <Sparkles size={18} />
                Plan a Trip
              </Link>
            )}
          </div>

          {/* Auth gate */}
          {!authLoading && !user && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-20 h-20 bg-gradient-to-br from-gold-100 to-teal-50 rounded-full flex items-center justify-center mb-6">
                <Plane size={32} className="text-gold-700" />
              </div>
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                Sign in to plan your trips
              </h2>
              <p className="text-navy-400 mb-6 text-center max-w-md">
                Create AI-powered itineraries, save your plans, and share them
                with travel companions.
              </p>
              <Link
                href="/auth/signin?next=%2Ftrips"
                className="bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-800 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Loading */}
          {(authLoading || (user && loading)) && (
            <div role="status" className="flex items-center justify-center py-24">
              <Loader2 aria-label="Loading trips" size={32} className="animate-spin text-gold-700" />
            </div>
          )}

          {/* Empty state */}
          {user && !authLoading && !loading && error && <div role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-red-700"><p>{error}</p><button type="button" disabled={deleting !== null} onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline disabled:opacity-50">Try loading trips again</button></div>}
          {user && !authLoading && !loading && !error && trips.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-20 h-20 bg-gradient-to-br from-gold-100 to-teal-50 rounded-full flex items-center justify-center mb-6">
                <Sparkles size={32} className="text-gold-700" />
              </div>
              <h2 className="text-xl font-semibold text-navy-700 mb-2">
                No trips yet
              </h2>
              <p className="text-navy-400 mb-6 text-center max-w-md">
                Let our AI plan the perfect island getaway for you. Choose your
                destination, dates, and interests -- we&apos;ll handle the rest.
              </p>
              <Link
                href="/trips/new"
                className="flex items-center gap-2 bg-gradient-to-r from-gold-700 to-gold-800 text-white px-6 py-3 rounded-2xl font-semibold hover:from-gold-800 hover:to-gold-900 transition-all shadow-lg shadow-gold-500/25"
              >
                <Plus size={18} />
                Create Your First Trip
              </Link>
            </div>
          )}

          {/* Trip cards */}
          {user && !authLoading && !loading && trips.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  className="group relative bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.1)] transition-all duration-300 overflow-hidden"
                >
                  {/* Gradient bar */}
                  <div className="h-2 bg-gradient-to-r from-gold-400 via-teal-400 to-gold-500" />

                  <Link href={`/trips/${trip.id}`} className="block p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-bold text-navy-700 group-hover:text-gold-600 transition-colors line-clamp-1">
                        {trip.title}
                      </h3>
                      {trip.isAiGenerated && (
                        <span className="flex items-center gap-1 text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-full shrink-0 ml-2">
                          <Sparkles size={12} />
                          AI
                        </span>
                      )}
                    </div>

                    {trip.islandName && (
                      <div className="flex items-center gap-1.5 text-sm text-navy-400 mb-2">
                        <MapPin size={14} className="text-gold-700" />
                        {trip.islandName}
                      </div>
                    )}

                    {trip.startDate && (
                      <div className="flex items-center gap-1.5 text-sm text-navy-400 mb-2">
                        <Calendar size={14} className="text-gold-700" />
                        {formatDate(trip.startDate)}
                        {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                        <span className="text-navy-300 ml-1">
                          ({getDays(trip.startDate, trip.endDate)} day
                          {getDays(trip.startDate, trip.endDate) !== 1
                            ? "s"
                            : ""}
                          )
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-cream-100">
                      <div className="flex items-center gap-1.5 text-sm text-navy-400">
                        <Users size={14} className="text-teal-500" />
                        {trip.guestCount} guest
                        {trip.guestCount !== 1 ? "s" : ""}
                      </div>
                      <div className="text-sm text-navy-300">
                        {trip.itemCount} activit
                        {trip.itemCount === 1 ? "y" : "ies"}
                      </div>
                    </div>
                  </Link>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(trip.id);
                    }}
                    disabled={deleting !== null}
                    className="absolute top-5 right-4 opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-cream-50 hover:bg-red-50 flex items-center justify-center text-navy-300 hover:text-red-500"
                    aria-label={`Delete ${trip.title}`}
                  >
                    {deleting === trip.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
