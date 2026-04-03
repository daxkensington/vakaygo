"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { calculateBookingPrice, formatCurrency } from "@/lib/pricing";
import { useCurrency } from "@/lib/currency";
import {
  Star,
  Calendar,
  Users as UsersIcon,
  Zap,
  Shield,
  Check,
  Loader2,
  ShieldCheck,
  Tag,
  X,
  ChevronDown,
} from "lucide-react";

type BookingWidgetProps = {
  listing: {
    id: string;
    type: string;
    priceAmount: string | null;
    priceCurrency: string | null;
    priceUnit: string | null;
    avgRating: string | null;
    reviewCount: number | null;
    isInstantBook: boolean | null;
  };
};

export function BookingWidget({ listing }: BookingWidgetProps) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { currency, format: formatConverted } = useCurrency();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [guests, setGuests] = useState(1);
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookingNumber, setBookingNumber] = useState("");
  const [paymentStep, setPaymentStep] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [directPayment, setDirectPayment] = useState(false);
  const [error, setError] = useState("");
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountType: string;
    discountValue: string;
    maxDiscount: string | null;
    description: string | null;
  } | null>(null);

  const pricePerUnit = parseFloat(listing.priceAmount || "0");

  // Calculate quantity
  let quantity = guests;
  if (listing.type === "stay" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    quantity = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }
  if (listing.priceUnit === "trip" || listing.priceUnit === "group") {
    quantity = 1;
  }

  const pricing = calculateBookingPrice({
    pricePerUnit,
    quantity,
    listingType: listing.type,
    currency: listing.priceCurrency || "USD",
    includeInsurance,
  });

  // Calculate promo discount
  let promoDiscount = 0;
  if (appliedPromo) {
    if (appliedPromo.discountType === "percentage") {
      promoDiscount = Math.round(pricing.total * parseFloat(appliedPromo.discountValue) / 100 * 100) / 100;
    } else {
      promoDiscount = parseFloat(appliedPromo.discountValue);
    }
    if (appliedPromo.maxDiscount) {
      promoDiscount = Math.min(promoDiscount, parseFloat(appliedPromo.maxDiscount));
    }
    promoDiscount = Math.min(promoDiscount, pricing.total);
  }
  const finalTotal = pricing.total - promoDiscount;

  async function handleApplyPromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    try {
      const res = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoCode,
          listingType: listing.type,
          orderAmount: pricing.total,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedPromo({
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          maxDiscount: data.maxDiscount,
          description: data.description,
        });
        setPromoError("");
      } else {
        setPromoError(data.reason || "Invalid promo code");
        setAppliedPromo(null);
      }
    } catch {
      setPromoError("Failed to validate promo code");
    } finally {
      setPromoLoading(false);
    }
  }

  function handleRemovePromo() {
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError("");
  }

  async function handleGuestCheckout(e: React.FormEvent) {
    e.preventDefault();
    setGuestLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: guestName,
          email: guestEmail,
          phone: guestPhone || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      // Refresh auth context so user is now logged in
      await refresh();
      setShowGuestForm(false);

      // Proceed with booking
      await handleBook();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleBook() {
    if (!user && !showGuestForm) {
      setShowGuestForm(true);
      return;
    }
    if (!startDate) {
      setError("Please select a date");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          startDate,
          endDate: endDate || null,
          guestCount: guests,
          includeInsurance,
          promoCode: appliedPromo?.code || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Booking failed");
        return;
      }

      setBookingId(data.booking.id);
      setBookingNumber(data.booking.bookingNumber);
      setPaymentStep(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePayNow() {
    setPaymentLoading(true);
    setError("");

    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });

      const data = await res.json();

      if (data.fallback) {
        setError("");
        setDirectPayment(true);
        setPaymentStep(false);
        setBooked(true);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Payment setup failed");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  }

  if (paymentStep) {
    return (
      <div className="lg:col-span-1">
        <div className="sticky top-24 bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
          <div className="w-16 h-16 bg-gold-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-navy-700 text-center">Complete Your Booking</h3>
          <p className="text-navy-400 mt-2 text-center">
            Booking #{bookingNumber}
          </p>

          {/* Booking Summary */}
          <div className="mt-4 space-y-2 text-sm border-t border-cream-200 pt-4">
            <div className="flex justify-between">
              <span className="text-navy-400">Subtotal</span>
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
            {promoDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Promo discount</span>
                <span>-{formatCurrency(promoDiscount)}</span>
              </div>
            )}
            <div className="border-t border-cream-200 pt-2 flex justify-between font-semibold">
              <span className="text-navy-700">Total</span>
              <span className="text-navy-700">{formatCurrency(finalTotal)}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl mt-4">
              {error}
            </div>
          )}

          {/* Pay Now Button */}
          <button
            onClick={handlePayNow}
            disabled={paymentLoading}
            className="w-full mt-6 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-4 rounded-xl font-semibold transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2"
          >
            {paymentLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <Shield size={18} />
                Pay Now
              </>
            )}
          </button>

          {/* Pay Later Option */}
          <button
            onClick={() => {
              setPaymentStep(false);
              setBooked(true);
            }}
            disabled={paymentLoading}
            className="w-full mt-3 bg-transparent hover:bg-cream-50 text-navy-400 hover:text-navy-600 py-3 rounded-xl font-medium transition-all text-sm"
          >
            Pay Later
          </button>

          <p className="text-center text-navy-300 text-xs mt-3">
            Secure checkout powered by Stripe
          </p>
        </div>
      </div>
    );
  }

  if (booked) {
    return (
      <div className="lg:col-span-1">
        <div className="sticky top-24 bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)] text-center">
          <div className="w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-white" />
          </div>
          <h3 role="status" className="text-xl font-bold text-navy-700">Booking Confirmed!</h3>
          <p className="text-navy-400 mt-2">
            Booking #{bookingNumber}
          </p>
          <p className="text-sm text-navy-400 mt-1">
            Total: {formatCurrency(pricing.total)}
          </p>
          {directPayment ? (
            <p className="text-xs text-navy-300 mt-4">
              This operator accepts direct payment. Your booking has been
              submitted — the operator will confirm it shortly.
            </p>
          ) : (
            <p className="text-xs text-navy-300 mt-4">
              Check your email for confirmation details.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lg:col-span-1">
      <div className="sticky top-24 bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
        {/* Price */}
        <div className="mb-6">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-navy-700">
              {formatConverted(pricePerUnit)}
            </span>
            <span className="text-navy-400">
              / {listing.priceUnit || "unit"}
            </span>
          </div>
          {currency !== "USD" && (
            <p className="text-xs text-navy-300 mt-1">
              Prices shown in {currency}. You&apos;ll be charged in USD.
            </p>
          )}
          {listing.avgRating && parseFloat(listing.avgRating) > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <Star size={14} className="text-gold-500 fill-gold-500" />
              <span className="text-sm font-semibold text-navy-700">
                {parseFloat(listing.avgRating).toFixed(1)}
              </span>
              <span className="text-sm text-navy-400">
                · {listing.reviewCount} reviews
              </span>
            </div>
          )}
        </div>

        {/* Date Selection */}
        <div className="space-y-3 mb-6">
          <div className="border border-cream-300 rounded-xl p-3 focus-within:border-gold-500 transition-colors">
            <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">
              {listing.type === "stay" ? "Check-in" : "Date"}
            </label>
            <div className="flex items-center gap-2 mt-1">
              <Calendar size={16} className="text-navy-300" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent text-navy-700 outline-none text-sm"
              />
            </div>
          </div>
          {listing.type === "stay" && (
            <div className="border border-cream-300 rounded-xl p-3 focus-within:border-gold-500 transition-colors">
              <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">
                Check-out
              </label>
              <div className="flex items-center gap-2 mt-1">
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
          <div className="border border-cream-300 rounded-xl p-3 focus-within:border-gold-500 transition-colors">
            <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">
              Guests
            </label>
            <div className="flex items-center gap-2 mt-1">
              <UsersIcon size={16} className="text-navy-300" />
              <select
                value={guests}
                onChange={(e) => setGuests(parseInt(e.target.value))}
                className="w-full bg-transparent text-navy-700 outline-none text-sm appearance-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} guest{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Trip Insurance */}
        <label className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={includeInsurance}
            onChange={(e) => setIncludeInsurance(e.target.checked)}
            className="w-4 h-4 accent-teal-500"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-navy-700">
              Add trip protection
            </p>
            <p className="text-xs text-navy-400">
              Cancel for any reason — {formatCurrency(pricing.insuranceFee || pricing.subtotal * 0.08)}
            </p>
          </div>
          <ShieldCheck size={18} className="text-teal-500" />
        </label>

        {/* Promo Code */}
        <div className="mb-6">
          {!appliedPromo ? (
            <div>
              <button
                type="button"
                onClick={() => setShowPromo(!showPromo)}
                className="flex items-center gap-1.5 text-sm text-navy-400 hover:text-navy-600 font-medium transition-colors"
              >
                <Tag size={14} />
                Have a promo code?
                <ChevronDown size={14} className={`transition-transform ${showPromo ? "rotate-180" : ""}`} />
              </button>
              {showPromo && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="flex-1 px-3 py-2 rounded-lg bg-cream-50 border border-cream-300 text-navy-700 placeholder:text-navy-300 outline-none focus:border-gold-500 text-sm font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    disabled={promoLoading || !promoCode.trim()}
                    className="px-4 py-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {promoLoading ? <Loader2 size={14} className="animate-spin" /> : "Apply"}
                  </button>
                </div>
              )}
              {promoError && (
                <p className="mt-2 text-xs text-red-500">{promoError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-green-50 px-3 py-2.5 rounded-xl">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-700">{appliedPromo.code}</p>
                  {appliedPromo.description && (
                    <p className="text-xs text-green-600">{appliedPromo.description}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemovePromo}
                className="p-1 hover:bg-green-100 rounded-full transition-colors"
              >
                <X size={14} className="text-green-600" />
              </button>
            </div>
          )}
        </div>

        {/* Price Breakdown */}
        <div className="space-y-2 mb-6 text-sm">
          <div className="flex justify-between">
            <span className="text-navy-400">
              {formatCurrency(pricePerUnit)} × {quantity} {listing.priceUnit}
              {quantity > 1 ? "s" : ""}
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
          {promoDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Promo discount</span>
              <span>-{formatCurrency(promoDiscount)}</span>
            </div>
          )}
          <div className="border-t border-cream-200 pt-2 flex justify-between font-semibold">
            <span className="text-navy-700">Total</span>
            <span className="text-navy-700">
              {promoDiscount > 0 ? (
                <>
                  <span className="line-through text-navy-300 mr-1 font-normal text-xs">{formatCurrency(pricing.total)}</span>
                  {formatCurrency(finalTotal)}
                </>
              ) : (
                formatCurrency(pricing.total)
              )}
            </span>
          </div>
        </div>

        {/* Guest Checkout Form */}
        {showGuestForm && !user && (
          <div className="mb-6 p-4 rounded-xl bg-cream-50 border border-cream-200">
            <p className="text-sm font-semibold text-navy-700 mb-1">
              Book as a guest
            </p>
            <p className="text-xs text-navy-400 mb-4">
              We&apos;ll create an account for you so you can manage your booking.
            </p>
            <form onSubmit={handleGuestCheckout} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Full name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
              />
              <input
                type="email"
                required
                placeholder="Email address"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
              />
              <button
                type="submit"
                disabled={guestLoading}
                className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2 text-sm"
              >
                {guestLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Continue & Book"
                )}
              </button>
            </form>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-px bg-cream-200" />
              <span className="text-xs text-navy-300">or</span>
              <div className="flex-1 h-px bg-cream-200" />
            </div>
            <a
              href="/auth/signin"
              className="block text-center text-sm text-gold-500 font-semibold hover:text-gold-600 mt-3"
            >
              Sign in to your account
            </a>
          </div>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* Book Button */}
        {(!showGuestForm || user) && (
          <>
            <button
              onClick={handleBook}
              disabled={loading}
              className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-4 rounded-xl font-semibold transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : listing.isInstantBook ? (
                <>
                  <Zap size={18} />
                  Book Now
                </>
              ) : (
                "Request to Book"
              )}
            </button>
            <p className="text-center text-navy-300 text-xs mt-3">
              {user ? "You won't be charged yet" : "Continue as guest or sign in"}
            </p>
          </>
        )}

        {/* Trust Signals */}
        <div className="mt-6 pt-6 border-t border-cream-200 space-y-3">
          <div className="flex items-center gap-2 text-sm text-navy-400">
            <Shield size={16} className="text-teal-500" />
            Verified local operator
          </div>
          <div className="flex items-center gap-2 text-sm text-navy-400">
            <Check size={16} className="text-teal-500" />
            Free cancellation up to 24h
          </div>
          <div className="flex items-center gap-2 text-sm text-navy-400">
            <Check size={16} className="text-teal-500" />
            Secure payment via VakayGo
          </div>
        </div>

        {/* Operator Earnings Transparency */}
        <div className="mt-4 pt-4 border-t border-cream-200">
          <p className="text-xs text-navy-300 text-center">
            The operator earns {formatCurrency(pricing.operatorEarnings)} from this booking.
            <br />
            {pricing.rateInfo}
          </p>
        </div>
      </div>
    </div>
  );
}
