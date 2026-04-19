"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Clock,
  Check,
  X,
  AlertCircle,
  Loader2,
  DollarSign,
} from "lucide-react";

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
  guestNotes: string | null;
  createdAt: string;
  listingTitle: string;
  listingType: string;
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof Check }> = {
  pending: { label: "Pending", color: "bg-yellow-50 text-yellow-700", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-teal-50 text-teal-700", icon: Check },
  cancelled: { label: "Cancelled", color: "bg-red-50 text-red-600", icon: X },
  completed: { label: "Completed", color: "bg-green-50 text-green-700", icon: Check },
  refunded: { label: "Refunded", color: "bg-navy-50 text-navy-600", icon: AlertCircle },
  no_show: { label: "No Show", color: "bg-red-50 text-red-600", icon: AlertCircle },
};

export default function OperatorBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function fetchBookings() {
      try {
        const res = await fetch("/api/bookings?view=operator");
        const data = await res.json();
        setBookings(data.bookings || []);
      } catch {
        setBookings([]);
      } finally {
        setLoading(false);
      }
    }
    fetchBookings();
  }, []);

  async function updateStatus(bookingId: string, newStatus: string) {
    try {
      await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
      );
    } catch {
      // silently fail
    }
  }

  const filtered =
    filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  const totalRevenue = bookings
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((sum, b) => sum + parseFloat(b.subtotal), 0);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bookings
          </h1>
          <p className="text-navy-400 mt-1">
            Manage incoming bookings from travelers
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-gold-700" />
            <div>
              <p className="text-xs text-navy-400">Revenue</p>
              <p className="font-bold text-navy-700">
                ${totalRevenue.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {["all", "pending", "confirmed", "completed", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-all ${
              filter === f
                ? "bg-navy-700 text-white"
                : "bg-white text-navy-500 hover:bg-cream-100 shadow-sm"
            }`}
          >
            {f}
            {f !== "all" && (
              <span className="ml-1.5 text-xs opacity-60">
                ({bookings.filter((b) => b.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-gold-700" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <CalendarCheck size={40} className="text-navy-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-navy-700">No bookings yet</h3>
          <p className="text-navy-400 mt-2">
            When travelers book your listings, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((booking) => {
            const status = statusConfig[booking.status] || statusConfig.pending;
            const StatusIcon = status.icon;
            return (
              <div
                key={booking.id}
                className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        href={`/operator/bookings/${booking.id}`}
                        className="font-semibold text-navy-700 hover:text-gold-600 transition-colors"
                      >
                        {booking.listingTitle}
                      </Link>
                      <span
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.color}`}
                      >
                        <StatusIcon size={12} />
                        {status.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-navy-400">
                      <span>#{booking.bookingNumber}</span>
                      <span>
                        {new Date(booking.startDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span>{booking.guestCount} guest{booking.guestCount > 1 ? "s" : ""}</span>
                      <span className="capitalize">{booking.listingType}</span>
                    </div>
                    {booking.guestNotes && (
                      <p className="mt-2 text-sm text-navy-500 bg-cream-50 px-3 py-2 rounded-lg">
                        &ldquo;{booking.guestNotes}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold text-navy-700 text-lg">
                        ${parseFloat(booking.subtotal).toFixed(2)}
                      </p>
                      <p className="text-xs text-navy-400">your earnings</p>
                    </div>

                    {booking.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus(booking.id, "confirmed")}
                          className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => updateStatus(booking.id, "cancelled")}
                          className="bg-white hover:bg-red-50 text-red-500 border border-red-200 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
