"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Loader2,
  Check,
  X,
  Clock,
  AlertCircle,
  DollarSign,
  StickyNote,
} from "lucide-react";

type Booking = {
  id: string;
  bookingNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  guestCount: number | null;
  subtotal: string;
  serviceFee: string | null;
  totalAmount: string;
  currency: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  guestNotes: string | null;
  operatorNotes: string | null;
  cancellationReason: string | null;
  checkedIn: boolean | null;
  checkedInAt: string | null;
  depositAmount: string | null;
  depositPaid: boolean | null;
  escrowReleased: boolean | null;
  escrowReleasedAt: string | null;
  createdAt: string;
  travelerName: string | null;
  travelerEmail: string;
  travelerPhone: string | null;
  listingTitle: string;
  listingType: string;
  listingSlug: string;
  islandSlug: string;
  islandName: string;
};

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Check }
> = {
  pending: { label: "Pending", color: "bg-yellow-50 text-yellow-700", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-teal-50 text-teal-700", icon: Check },
  cancelled: { label: "Cancelled", color: "bg-red-50 text-red-600", icon: X },
  completed: { label: "Completed", color: "bg-green-50 text-green-700", icon: Check },
  refunded: { label: "Refunded", color: "bg-navy-50 text-navy-600", icon: AlertCircle },
  no_show: { label: "No Show", color: "bg-red-50 text-red-600", icon: AlertCircle },
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(amount: string | null, currency: string | null) {
  if (!amount) return "—";
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return "—";
  return `${currency || "USD"} ${num.toFixed(2)}`;
}

export default function OperatorBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        if (cancelled) return;
        setBooking(json.booking);
        setNotes(json.booking.operatorNotes || "");
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function updateStatus(newStatus: string) {
    if (!booking) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setBooking({ ...booking, status: newStatus });
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!booking) return;
    setSaving(true);
    try {
      await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorNotes: notes }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gold-500" />
      </div>
    );
  }

  if (notFound || !booking) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <AlertCircle size={40} className="text-navy-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-navy-700">Booking not found</h1>
        <p className="text-navy-400 mt-2">
          It may have been removed or you don&apos;t have access to it.
        </p>
        <Link
          href="/operator/bookings"
          className="inline-flex items-center gap-2 mt-6 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          <ArrowLeft size={16} /> Back to Bookings
        </Link>
      </div>
    );
  }

  const status = statusConfig[booking.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/operator/bookings"
        className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700 mb-4"
      >
        <ArrowLeft size={14} /> Back to all bookings
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1
                className="text-2xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {booking.listingTitle}
              </h1>
              <span
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.color}`}
              >
                <StatusIcon size={12} />
                {status.label}
              </span>
            </div>
            <p className="text-sm text-navy-400">
              Booking #{booking.bookingNumber} · created {formatDate(booking.createdAt)}
            </p>
            <Link
              href={`/${booking.islandSlug}/${booking.listingSlug}`}
              className="inline-flex items-center gap-1 mt-2 text-sm text-gold-600 hover:text-gold-700"
            >
              <MapPin size={12} /> {booking.islandName} · view listing
            </Link>
          </div>

          {booking.status === "pending" && (
            <div className="flex gap-2">
              <button
                onClick={() => updateStatus("confirmed")}
                disabled={saving}
                className="bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => updateStatus("cancelled")}
                disabled={saving}
                className="bg-white hover:bg-red-50 text-red-500 border border-red-200 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                Decline
              </button>
            </div>
          )}

          {booking.status === "confirmed" && (
            <button
              onClick={() => updateStatus("completed")}
              disabled={saving}
              className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors self-start"
            >
              Mark Completed
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trip details */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-navy-700 mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-gold-500" />
            Trip Details
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-400">Start</dt>
              <dd className="text-navy-700 font-medium">{formatDate(booking.startDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-400">End</dt>
              <dd className="text-navy-700 font-medium">{formatDate(booking.endDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-400">Guests</dt>
              <dd className="text-navy-700 font-medium">{booking.guestCount ?? 1}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-400">Type</dt>
              <dd className="text-navy-700 font-medium capitalize">{booking.listingType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-400">Checked in</dt>
              <dd className="text-navy-700 font-medium">
                {booking.checkedIn ? formatDate(booking.checkedInAt) : "No"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Traveler */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-navy-700 mb-4 flex items-center gap-2">
            <User size={16} className="text-gold-500" />
            Traveler
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-navy-400">Name</dt>
              <dd className="text-navy-700 font-medium text-right">
                {booking.travelerName || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-400 flex items-center gap-1">
                <Mail size={12} /> Email
              </dt>
              <dd className="text-right">
                <a
                  href={`mailto:${booking.travelerEmail}`}
                  className="text-gold-600 hover:text-gold-700 break-all"
                >
                  {booking.travelerEmail}
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-400 flex items-center gap-1">
                <Phone size={12} /> Phone
              </dt>
              <dd className="text-right">
                {booking.travelerPhone ? (
                  <a
                    href={`tel:${booking.travelerPhone}`}
                    className="text-gold-600 hover:text-gold-700"
                  >
                    {booking.travelerPhone}
                  </a>
                ) : (
                  <span className="text-navy-400">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Payment */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-navy-700 mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-gold-500" />
            Payment
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-400">Subtotal (your earnings)</dt>
              <dd className="text-navy-700 font-medium">
                {formatMoney(booking.subtotal, booking.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-400">Service fee</dt>
              <dd className="text-navy-700 font-medium">
                {formatMoney(booking.serviceFee, booking.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-cream-100 pt-3">
              <dt className="text-navy-400">Total charged</dt>
              <dd className="text-navy-700 font-bold">
                {formatMoney(booking.totalAmount, booking.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-400 flex items-center gap-1">
                <CreditCard size={12} /> Method
              </dt>
              <dd className="text-navy-700 font-medium capitalize">
                {booking.paymentMethod || "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-400">Paid at</dt>
              <dd className="text-navy-700 font-medium">{formatDate(booking.paidAt)}</dd>
            </div>
            {booking.depositAmount && parseFloat(booking.depositAmount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-navy-400">Deposit</dt>
                <dd className="text-navy-700 font-medium">
                  {formatMoney(booking.depositAmount, booking.currency)}{" "}
                  {booking.depositPaid ? "(paid)" : "(unpaid)"}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-navy-400">Escrow</dt>
              <dd className="text-navy-700 font-medium">
                {booking.escrowReleased
                  ? `Released ${formatDate(booking.escrowReleasedAt)}`
                  : "Held"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-semibold text-navy-700 mb-4 flex items-center gap-2">
            <StickyNote size={16} className="text-gold-500" />
            Notes
          </h2>
          {booking.guestNotes && (
            <div className="mb-4">
              <p className="text-xs text-navy-400 uppercase tracking-wider mb-1">
                Guest message
              </p>
              <p className="text-sm text-navy-600 bg-cream-50 px-3 py-2 rounded-lg">
                &ldquo;{booking.guestNotes}&rdquo;
              </p>
            </div>
          )}
          {booking.cancellationReason && (
            <div className="mb-4">
              <p className="text-xs text-navy-400 uppercase tracking-wider mb-1">
                Cancellation reason
              </p>
              <p className="text-sm text-navy-600 bg-red-50 px-3 py-2 rounded-lg">
                {booking.cancellationReason}
              </p>
            </div>
          )}
          <p className="text-xs text-navy-400 uppercase tracking-wider mb-1">
            Your private notes
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes (not visible to traveler)…"
            rows={4}
            className="w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-navy-700 focus:outline-none focus:border-gold-400"
          />
          <button
            onClick={saveNotes}
            disabled={saving || notes === (booking.operatorNotes || "")}
            className="mt-3 bg-navy-700 hover:bg-navy-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >
            Save notes
          </button>
        </div>
      </div>
    </div>
  );
}
