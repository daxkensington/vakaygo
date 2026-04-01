"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { useAuth } from "@/lib/auth-context";
import { calculateBookingPrice, formatCurrency } from "@/lib/pricing";
import {
  Calendar,
  Users as UsersIcon,
  Shield,
  Check,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  Lock,
} from "lucide-react";

type ListingInfo = {
  id: string;
  title: string;
  slug: string;
  type: string;
  priceAmount: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  islandSlug: string;
  islandName: string;
  operatorName: string | null;
};

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [listing, setListing] = useState<ListingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Booking form
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState("");
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookingNumber, setBookingNumber] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`/api/listings/${params.slug}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setListing(data.listing);
      } catch {
        setListing(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.slug) fetchListing();
  }, [params.slug]);

  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 px-6 pt-20">
          <Lock size={48} className="text-navy-200 mb-6" />
          <h1 className="text-2xl font-bold text-navy-700">Sign in to book</h1>
          <Link href="/auth/signin" className="mt-6 bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold">
            Sign In
          </Link>
        </div>
      </>
    );
  }

  if (loading || !listing) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      </>
    );
  }

  const pricePerUnit = parseFloat(listing.priceAmount || "0");
  let quantity = guests;
  if (listing.type === "stay" && startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    quantity = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
  }
  if (listing.priceUnit === "trip" || listing.priceUnit === "group") quantity = 1;

  const pricing = calculateBookingPrice({
    pricePerUnit,
    quantity,
    listingType: listing.type,
    currency: listing.priceCurrency || "USD",
    includeInsurance,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate) { setError("Please select a date"); return; }
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing!.id,
          startDate,
          endDate: endDate || null,
          guestCount: guests,
          guestNotes: notes || null,
          includeInsurance,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setBooked(true);
      setBookingNumber(data.booking.bookingNumber);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (booked) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-cream-50 pt-20">
          <div className="mx-auto max-w-lg px-6 py-16 text-center">
            <div className="w-20 h-20 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-8">
              <Check size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
              Booking Confirmed!
            </h1>
            <p className="text-navy-400 mt-4">
              Booking #{bookingNumber}
            </p>
            <p className="text-navy-500 mt-2">
              {listing.title} · {formatCurrency(pricing.total)}
            </p>
            <p className="text-sm text-navy-400 mt-6">
              A confirmation email has been sent to {user.email}. The operator will be notified of your booking.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link href="/bookings" className="bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
                View My Bookings
              </Link>
              <Link href="/explore" className="bg-white text-navy-600 px-6 py-3 rounded-xl font-semibold shadow-sm hover:bg-cream-50 transition-colors">
                Explore More
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-cream-50 pt-20">
        <div className="mx-auto max-w-4xl px-6 py-10">
          {/* Back */}
          <Link
            href={`/${params.island}/${params.slug}`}
            className="flex items-center gap-2 text-navy-400 hover:text-navy-600 text-sm mb-8"
          >
            <ArrowLeft size={16} />
            Back to listing
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Form */}
            <div className="lg:col-span-3">
              <h1 className="text-2xl font-bold text-navy-700 mb-8" style={{ fontFamily: "var(--font-display)" }}>
                Complete your booking
              </h1>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Dates */}
                <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
                  <h2 className="font-bold text-navy-700 mb-4">When</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-navy-600 mb-1.5">
                        {listing.type === "stay" ? "Check-in" : "Date"}
                      </label>
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-cream-50">
                        <Calendar size={16} className="text-navy-300" />
                        <input
                          type="date"
                          required
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full bg-transparent text-navy-700 outline-none text-sm"
                        />
                      </div>
                    </div>
                    {listing.type === "stay" && (
                      <div>
                        <label className="block text-sm font-medium text-navy-600 mb-1.5">Check-out</label>
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-cream-50">
                          <Calendar size={16} className="text-navy-300" />
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full bg-transparent text-navy-700 outline-none text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Guests */}
                <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
                  <h2 className="font-bold text-navy-700 mb-4">Guests</h2>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-cream-50 max-w-xs">
                    <UsersIcon size={16} className="text-navy-300" />
                    <select
                      value={guests}
                      onChange={(e) => setGuests(parseInt(e.target.value))}
                      className="w-full bg-transparent text-navy-700 outline-none text-sm appearance-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n} guest{n > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Special Requests */}
                <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
                  <h2 className="font-bold text-navy-700 mb-4">Special Requests</h2>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none resize-none text-sm"
                    placeholder="Allergies, celebrations, accessibility needs, or anything the operator should know..."
                  />
                </div>

                {/* Trip Protection */}
                <label className="flex items-center gap-4 bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInsurance}
                    onChange={(e) => setIncludeInsurance(e.target.checked)}
                    className="w-5 h-5 accent-teal-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={18} className="text-teal-500" />
                      <span className="font-semibold text-navy-700">Trip Protection</span>
                    </div>
                    <p className="text-sm text-navy-400 mt-1">
                      Cancel for any reason and get a full refund. {formatCurrency(pricing.insuranceFee || pricing.subtotal * 0.08)}
                    </p>
                  </div>
                </label>

                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-4 rounded-xl font-semibold transition-all hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2 text-lg"
                >
                  {submitting ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      <CreditCard size={20} />
                      Confirm & Pay {formatCurrency(pricing.total)}
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-4 text-xs text-navy-300">
                  <div className="flex items-center gap-1"><Lock size={12} /> Secure payment</div>
                  <div className="flex items-center gap-1"><Shield size={12} /> Free cancellation 24h</div>
                </div>
              </form>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
                <h3 className="font-bold text-navy-700 mb-4">Order Summary</h3>

                <div className="pb-4 mb-4 border-b border-cream-200">
                  <p className="font-semibold text-navy-700">{listing.title}</p>
                  <p className="text-sm text-navy-400 capitalize">{listing.type} · {listing.islandName}</p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-navy-400">
                      {formatCurrency(pricePerUnit)} × {quantity} {listing.priceUnit}{quantity > 1 ? "s" : ""}
                    </span>
                    <span className="text-navy-700">{formatCurrency(pricing.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-400">Service fee</span>
                    <span className="text-navy-700">{formatCurrency(pricing.serviceFee)}</span>
                  </div>
                  {includeInsurance && pricing.insuranceFee && (
                    <div className="flex justify-between">
                      <span className="text-navy-400">Trip protection</span>
                      <span className="text-navy-700">{formatCurrency(pricing.insuranceFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t border-cream-200 font-semibold text-base">
                    <span className="text-navy-700">Total</span>
                    <span className="text-navy-700">{formatCurrency(pricing.total)}</span>
                  </div>
                </div>

                <div className="mt-6 p-3 bg-cream-50 rounded-xl text-xs text-navy-400 text-center">
                  Operator earns {formatCurrency(pricing.operatorEarnings)} · VakayGo takes 3%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
