"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  CalendarCheck,
  Clock,
  Check,
  X,
  Loader2,
  MapPin,
  Star,
  AlertCircle,
  Info,
  CreditCard,
  AlertTriangle,
  QrCode,
} from "lucide-react";
import { ReviewModal } from "@/components/listings/review-modal";
import { DisputeModal } from "@/components/disputes/dispute-modal";

type Booking = {
  id: string;
  bookingNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  guestCount: number;
  subtotal: string;
  serviceFee: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  listingTitle: string;
  listingType: string;
  listingSlug: string;
  paidAt: string | null;
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-yellow-700", bg: "bg-yellow-50" },
  confirmed: { label: "Confirmed", color: "text-teal-700", bg: "bg-teal-50" },
  cancelled: { label: "Cancelled", color: "text-red-600", bg: "bg-red-50" },
  completed: { label: "Completed", color: "text-green-700", bg: "bg-green-50" },
  refunded: { label: "Refunded", color: "text-navy-600", bg: "bg-navy-50" },
};

export default function TravelerBookingsPage() {
  return (
    <Suspense fallback={<><Header /><div className="min-h-screen flex items-center justify-center bg-cream-50"><Loader2 size={32} className="animate-spin text-gold-500" /></div></>}>
      <BookingsContent />
    </Suspense>
  );
}

function BookingsContent() {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{
    bookingId: string;
    listingTitle: string;
  } | null>(null);
  const [disputeModal, setDisputeModal] = useState<{
    bookingId: string;
    bookingNumber: string;
    listingTitle: string;
  } | null>(null);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  const paidBookingNumber = searchParams.get("paid");
  const cancelledBookingNumber = searchParams.get("cancelled");

  const [showSuccessBanner, setShowSuccessBanner] = useState(!!paidBookingNumber);
  const [showCancelBanner, setShowCancelBanner] = useState(!!cancelledBookingNumber);

  // Auto-dismiss success banner after 10s and clean URL
  useEffect(() => {
    if (paidBookingNumber) {
      setShowSuccessBanner(true);
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 10000);
      // Clean URL params
      const timeout = setTimeout(() => {
        router.replace("/bookings", { scroll: false });
      }, 500);
      return () => {
        clearTimeout(timer);
        clearTimeout(timeout);
      };
    }
  }, [paidBookingNumber, router]);

  // Clean URL for cancel param
  useEffect(() => {
    if (cancelledBookingNumber) {
      setShowCancelBanner(true);
      const timeout = setTimeout(() => {
        router.replace("/bookings", { scroll: false });
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [cancelledBookingNumber, router]);

  const handlePayNow = useCallback(async (bookingId: string) => {
    setPayingBookingId(bookingId);
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start checkout");
        setPayingBookingId(null);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setPayingBookingId(null);
    }
  }, []);

  // Find the cancelled booking to enable "Try Again"
  const cancelledBooking = cancelledBookingNumber
    ? bookings.find((b) => b.bookingNumber === cancelledBookingNumber)
    : null;

  useEffect(() => {
    if (!user) return;
    async function fetchBookings() {
      try {
        const res = await fetch("/api/bookings?view=traveler");
        const data = await res.json();
        setBookings(data.bookings || []);
      } catch {
        setBookings([]);
      } finally {
        setLoading(false);
      }
    }
    fetchBookings();
  }, [user]);

  if (authLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 px-6 pt-20">
          <CalendarCheck size={48} className="text-navy-200 mb-6" />
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
            Sign in to view your bookings
          </h1>
          <p className="text-navy-400 mt-2">Keep track of all your trips in one place.</p>
          <Link href="/auth/signin" className="mt-6 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
            Sign In
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-3xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
            My Bookings
          </h1>
          <p className="text-navy-400 mt-1">Your upcoming and past trips</p>

          {/* Payment success banner */}
          {showSuccessBanner && paidBookingNumber && (
            <div className="mt-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
              <div className="flex-shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <Check size={18} className="text-white" />
              </div>
              <p className="flex-1 text-green-800 font-medium">
                Payment successful! Your booking <span className="font-bold">#{paidBookingNumber}</span> has been confirmed.
              </p>
              <button
                onClick={() => setShowSuccessBanner(false)}
                className="text-green-600 hover:text-green-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {/* Payment cancelled banner */}
          {showCancelBanner && cancelledBookingNumber && (
            <div className="mt-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                <Info size={18} className="text-white" />
              </div>
              <p className="flex-1 text-amber-800 font-medium">
                Payment was cancelled. Your booking <span className="font-bold">#{cancelledBookingNumber}</span> is still pending — you can pay later.
              </p>
              <div className="flex items-center gap-2">
                {cancelledBooking && (
                  <button
                    onClick={() => {
                      setShowCancelBanner(false);
                      handlePayNow(cancelledBooking.id);
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                )}
                <button
                  onClick={() => setShowCancelBanner(false)}
                  className="text-amber-600 hover:text-amber-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-gold-500" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center mt-8">
              <CalendarCheck size={48} className="text-navy-200 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-navy-700">No bookings yet</h3>
              <p className="text-navy-400 mt-2 max-w-md mx-auto">
                Explore stays, tours, dining, and experiences in the Caribbean.
                Your bookings will appear here.
              </p>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-6"
              >
                Start Exploring
              </Link>
            </div>
          ) : (
            <div className="space-y-4 mt-8">
              {bookings.map((booking) => {
                const status = statusConfig[booking.status] || statusConfig.pending;
                const isPast = new Date(booking.startDate) < new Date();
                return (
                  <div
                    key={booking.id}
                    className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link
                            href={`/grenada/${booking.listingSlug}`}
                            className="font-semibold text-navy-700 hover:text-gold-600 transition-colors text-lg"
                          >
                            {booking.listingTitle}
                          </Link>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.bg} ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-navy-400">
                          <span className="flex items-center gap-1">
                            <CalendarCheck size={14} />
                            {new Date(booking.startDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span>#{booking.bookingNumber}</span>
                          <span className="capitalize">{booking.listingType}</span>
                          <span>{booking.guestCount} guest{booking.guestCount > 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-navy-700">
                          ${parseFloat(booking.totalAmount).toFixed(2)}
                        </p>
                        <p className="text-xs text-navy-400">
                          {booking.paidAt ? "total paid" : "total due"}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    {isPast && booking.status === "completed" && (
                      <div className="mt-4 pt-4 border-t border-cream-200 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Star size={14} className="text-gold-500" />
                          <p className="text-sm text-navy-400">How was your experience?</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/bookings/${booking.id}/voucher`}
                            className="text-sm font-semibold text-teal-500 hover:text-teal-600 flex items-center gap-1"
                          >
                            <QrCode size={14} />
                            Voucher
                          </Link>
                          <button
                            onClick={() =>
                              setDisputeModal({
                                bookingId: booking.id,
                                bookingNumber: booking.bookingNumber,
                                listingTitle: booking.listingTitle,
                              })
                            }
                            className="text-sm font-semibold text-red-500 hover:text-red-600 flex items-center gap-1"
                          >
                            <AlertTriangle size={14} />
                            Report Issue
                          </button>
                          <button
                            onClick={() =>
                              setReviewModal({
                                bookingId: booking.id,
                                listingTitle: booking.listingTitle,
                              })
                            }
                            className="text-sm font-semibold text-gold-500 hover:text-gold-600"
                          >
                            Leave a Review
                          </button>
                        </div>
                      </div>
                    )}
                    {booking.status === "confirmed" && booking.paidAt && (
                      <div className="mt-4 pt-4 border-t border-cream-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Check size={14} className="text-teal-500" />
                          <p className="text-sm text-navy-400">Confirmed and paid</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/bookings/${booking.id}/voucher`}
                            className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            <QrCode size={14} />
                            View Voucher
                          </Link>
                          <button
                            onClick={() =>
                              setDisputeModal({
                                bookingId: booking.id,
                                bookingNumber: booking.bookingNumber,
                                listingTitle: booking.listingTitle,
                              })
                            }
                            className="text-sm font-semibold text-red-500 hover:text-red-600 flex items-center gap-1"
                          >
                            <AlertTriangle size={14} />
                            Report Issue
                          </button>
                        </div>
                      </div>
                    )}
                    {(booking.status === "pending" || booking.status === "confirmed") && !booking.paidAt && (
                      <div className="mt-4 pt-4 border-t border-cream-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-yellow-500" />
                          <p className="text-sm text-navy-400">
                            {booking.status === "pending"
                              ? "Waiting for operator confirmation"
                              : "Payment required to finalize booking"}
                          </p>
                        </div>
                        <button
                          onClick={() => handlePayNow(booking.id)}
                          disabled={payingBookingId === booking.id}
                          className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                          {payingBookingId === booking.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CreditCard size={14} />
                          )}
                          Pay Now
                        </button>
                      </div>
                    )}
                    {booking.status === "pending" && booking.paidAt && (
                      <div className="mt-4 pt-4 border-t border-cream-200 flex items-center gap-2">
                        <Clock size={14} className="text-yellow-500" />
                        <p className="text-sm text-navy-400">
                          Paid — waiting for operator confirmation
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Footer />

      <ReviewModal
        isOpen={!!reviewModal}
        onClose={() => setReviewModal(null)}
        bookingId={reviewModal?.bookingId ?? ""}
        listingTitle={reviewModal?.listingTitle ?? ""}
        onSubmitted={() => {
          // Optionally refresh bookings or mark as reviewed
        }}
      />

      <DisputeModal
        isOpen={!!disputeModal}
        onClose={() => setDisputeModal(null)}
        bookingId={disputeModal?.bookingId ?? ""}
        bookingNumber={disputeModal?.bookingNumber ?? ""}
        listingTitle={disputeModal?.listingTitle ?? ""}
        onSubmitted={() => {
          // Optionally refresh bookings
        }}
      />
    </>
  );
}
