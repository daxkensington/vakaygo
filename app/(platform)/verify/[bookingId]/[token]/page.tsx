"use client";

import { useEffect, useState, useCallback } from "react";
import { use } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  Users,
  MapPin,
  Clock,
  UserCheck,
  AlertTriangle,
} from "lucide-react";

type VerifyData = {
  valid: boolean;
  id: string;
  bookingNumber: string;
  status: string;
  listingTitle: string;
  listingType: string;
  listingAddress: string | null;
  startDate: string;
  endDate: string | null;
  guestCount: number;
  totalAmount: string;
  currency: string;
  verificationToken: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  guestName: string;
  guestEmail: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function VerifyPage({
  params,
}: {
  params: Promise<{ bookingId: string; token: string }>;
}) {
  const { bookingId, token } = use(params);
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/verify`);
        if (!res.ok) {
          setError("Booking not found or invalid");
          return;
        }
        const result = await res.json();

        // Verify the token matches
        if (result.verificationToken !== token) {
          setError("Invalid verification link");
          return;
        }

        setData(result);
        setCheckedIn(result.checkedIn || false);
        setCheckInTime(result.checkedInAt);
      } catch {
        setError("Failed to verify booking");
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [bookingId, token]);

  const handleCheckIn = useCallback(async () => {
    if (!data) return;
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await res.json();
      if (result.success) {
        setCheckedIn(true);
        setCheckInTime(result.checkedInAt);
      } else {
        setError(result.error || "Failed to check in");
      }
    } catch {
      setError("Failed to check in");
    } finally {
      setCheckingIn(false);
    }
  }, [data, bookingId, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-gold-500 mx-auto" />
          <p className="mt-4 text-navy-400 font-medium">Verifying booking...</p>
        </div>
      </div>
    );
  }

  // Invalid / not found
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 px-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-[0_8px_40px_rgba(28,35,51,0.12)]">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <XCircle size={40} className="text-red-500" />
          </div>
          <h1
            className="text-2xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Verification Failed
          </h1>
          <p className="text-navy-400 mt-2">
            {error || "This booking could not be verified. The link may be invalid or expired."}
          </p>
          <div className="mt-6 p-4 bg-red-50 rounded-xl text-sm text-red-600">
            Please ask the guest to show a valid voucher or contact VakayGo support.
          </div>
        </div>
      </div>
    );
  }

  const isValid = data.status === "confirmed";
  const isExpired = data.status === "completed" || data.status === "cancelled" || data.status === "refunded";
  const isPending = data.status === "pending";
  const currencySymbol = data.currency === "XCD" ? "EC$" : "$";

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-[0_8px_40px_rgba(28,35,51,0.12)]">
        {/* Status Header */}
        <div
          className={`px-8 py-6 text-center ${
            checkedIn
              ? "bg-gradient-to-br from-green-600 to-green-500"
              : isValid
                ? "bg-gradient-to-br from-teal-600 to-teal-500"
                : isPending
                  ? "bg-gradient-to-br from-amber-500 to-amber-400"
                  : "bg-gradient-to-br from-red-500 to-red-400"
          }`}
        >
          {checkedIn ? (
            <>
              <CheckCircle2 size={48} className="text-white mx-auto" />
              <h1 className="text-2xl font-bold text-white mt-3" style={{ fontFamily: "var(--font-display)" }}>
                Checked In
              </h1>
              <p className="text-white/80 text-sm mt-1">
                {checkInTime ? `at ${formatTime(checkInTime)}` : "Successfully checked in"}
              </p>
            </>
          ) : isValid ? (
            <>
              <CheckCircle2 size={48} className="text-white mx-auto" />
              <h1 className="text-2xl font-bold text-white mt-3" style={{ fontFamily: "var(--font-display)" }}>
                Valid Booking
              </h1>
              <p className="text-white/80 text-sm mt-1">This booking is confirmed and valid</p>
            </>
          ) : isPending ? (
            <>
              <AlertTriangle size={48} className="text-white mx-auto" />
              <h1 className="text-2xl font-bold text-white mt-3" style={{ fontFamily: "var(--font-display)" }}>
                Pending Booking
              </h1>
              <p className="text-white/80 text-sm mt-1">This booking has not been confirmed yet</p>
            </>
          ) : (
            <>
              <XCircle size={48} className="text-white mx-auto" />
              <h1 className="text-2xl font-bold text-white mt-3" style={{ fontFamily: "var(--font-display)" }}>
                Invalid Booking
              </h1>
              <p className="text-white/80 text-sm mt-1">
                Status: {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
              </p>
            </>
          )}
        </div>

        {/* Booking Details */}
        <div className="px-8 py-6 space-y-4">
          <div className="text-center pb-4 border-b border-cream-200">
            <p className="text-xs font-medium text-navy-400 uppercase tracking-wider">Booking Number</p>
            <p className="text-lg font-bold text-navy-700 tracking-wider mt-1">{data.bookingNumber}</p>
          </div>

          <div className="space-y-3">
            <InfoRow
              icon={<MapPin size={16} className="text-teal-500" />}
              label="Experience"
              value={data.listingTitle}
            />
            <InfoRow
              icon={<Calendar size={16} className="text-teal-500" />}
              label="Date"
              value={formatDate(data.startDate)}
            />
            <InfoRow
              icon={<Clock size={16} className="text-teal-500" />}
              label="Time"
              value={formatTime(data.startDate)}
            />
            {data.endDate && (
              <InfoRow
                icon={<Calendar size={16} className="text-teal-500" />}
                label="End Date"
                value={formatDate(data.endDate)}
              />
            )}
            <InfoRow
              icon={<Users size={16} className="text-teal-500" />}
              label="Guests"
              value={`${data.guestCount} guest${data.guestCount > 1 ? "s" : ""}`}
            />
            <InfoRow
              icon={<UserCheck size={16} className="text-teal-500" />}
              label="Guest Name"
              value={data.guestName}
            />
            {data.listingAddress && (
              <InfoRow
                icon={<MapPin size={16} className="text-teal-500" />}
                label="Location"
                value={data.listingAddress}
              />
            )}
            <div className="flex justify-between items-center pt-3 border-t border-cream-200">
              <span className="text-sm font-semibold text-navy-600">Total Amount</span>
              <span className="text-xl font-bold text-gold-600">
                {currencySymbol}{parseFloat(data.totalAmount).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Check-in Button */}
        {isValid && !checkedIn && (
          <div className="px-8 pb-6">
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:shadow-[0_4px_20px_rgba(26,107,106,0.4)] flex items-center justify-center gap-2"
            >
              {checkingIn ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <UserCheck size={20} />
                  Mark as Checked In
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="bg-cream-50 text-center py-3 px-8">
          <p className="text-xs text-navy-300">
            Verified by VakayGo &mdash; vakaygo.com
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-navy-400">{label}</p>
        <p className="text-sm font-semibold text-navy-700 truncate">{value}</p>
      </div>
    </div>
  );
}
