"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import Link from "next/link";
import {
  Loader2,
  Printer,
  Calendar,
  Users,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  CalendarPlus,
} from "lucide-react";

type VoucherData = {
  qrCodeDataUrl: string;
  verifyUrl: string;
  bookingNumber: string;
  listingTitle: string;
  listingType: string;
  listingAddress: string | null;
  date: string;
  endDate: string | null;
  guestCount: number;
  guestName: string;
  operatorName: string;
  totalAmount: string;
  discountAmount: string | null;
  currency: string;
  status: string;
  checkedIn: boolean;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getGoogleCalendarUrl(data: VoucherData) {
  const start = new Date(data.date);
  const end = data.endDate ? new Date(data.endDate) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const formatGCal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: data.listingTitle,
    dates: `${formatGCal(start)}/${formatGCal(end)}`,
    details: `Booking #${data.bookingNumber}\nGuests: ${data.guestCount}\nOperator: ${data.operatorName}`,
    location: data.listingAddress || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function getICSContent(data: VoucherData) {
  const start = new Date(data.date);
  const end = data.endDate ? new Date(data.endDate) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const formatICS = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//VakayGo//Booking//EN
BEGIN:VEVENT
DTSTART:${formatICS(start)}
DTEND:${formatICS(end)}
SUMMARY:${data.listingTitle}
DESCRIPTION:Booking #${data.bookingNumber}\\nGuests: ${data.guestCount}\\nOperator: ${data.operatorName}
LOCATION:${data.listingAddress || ""}
END:VEVENT
END:VCALENDAR`;
}

function downloadICS(data: VoucherData) {
  const content = getICSContent(data);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vakaygo-${data.bookingNumber}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VoucherPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const [data, setData] = useState<VoucherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchVoucher() {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/voucher`);
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || "Failed to load voucher");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load voucher");
      } finally {
        setLoading(false);
      }
    }
    fetchVoucher();
  }, [bookingId]);

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-cream-50 pt-20">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 pt-20 px-6">
          <XCircle size={48} className="text-red-400 mb-4" />
          <h1 className="text-xl font-bold text-navy-700">{error || "Voucher not found"}</h1>
          <Link
            href="/bookings"
            className="mt-6 flex items-center gap-2 text-gold-500 hover:text-gold-600 font-semibold"
          >
            <ArrowLeft size={16} />
            Back to Bookings
          </Link>
        </div>
      </>
    );
  }

  const currencySymbol = data.currency === "XCD" ? "EC$" : "$";
  const isConfirmed = data.status === "confirmed" || data.status === "completed";

  return (
    <>
      <Header />
      <div className="min-h-screen bg-cream-50 pt-20 pb-12">
        <div className="mx-auto max-w-lg px-4">
          {/* Back link - hidden when printing */}
          <div className="print:hidden mb-6 flex items-center justify-between">
            <Link
              href="/bookings"
              className="flex items-center gap-2 text-navy-400 hover:text-navy-600 text-sm font-medium transition-colors"
            >
              <ArrowLeft size={16} />
              Back to Bookings
            </Link>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              <Printer size={16} />
              Print Voucher
            </button>
          </div>

          {/* Voucher Card */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(28,35,51,0.12)] print:shadow-none print:border print:border-gray-200">
            {/* Header */}
            <div className="bg-gradient-to-br from-navy-800 to-navy-700 text-cream-50 px-8 py-7 text-center">
              <h1
                className="text-3xl font-bold tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Vakay<span className="text-gold-400">Go</span>
              </h1>
              <p className="text-cream-200 text-sm mt-1">Booking Voucher</p>
            </div>

            {/* QR Code Section */}
            <div className="flex flex-col items-center px-8 py-8 border-b-2 border-dashed border-cream-200">
              <img
                src={data.qrCodeDataUrl}
                alt="Booking QR Code"
                className="w-56 h-56 md:w-64 md:h-64"
              />
              <p className="mt-4 text-xl font-bold tracking-wider text-navy-700">
                {data.bookingNumber}
              </p>
              <span
                className={`mt-2 inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-sm font-semibold text-white ${
                  isConfirmed ? "bg-teal-500" : data.status === "pending" ? "bg-gold-500" : "bg-navy-400"
                }`}
              >
                {isConfirmed && <CheckCircle2 size={14} />}
                {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
              </span>
              {data.checkedIn && (
                <span className="mt-2 inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <CheckCircle2 size={12} />
                  Checked In
                </span>
              )}
            </div>

            {/* Details */}
            <div className="px-8 py-6 space-y-0">
              <DetailRow label="Experience" value={data.listingTitle} />
              <DetailRow
                label="Type"
                value={data.listingType.charAt(0).toUpperCase() + data.listingType.slice(1)}
              />
              <DetailRow label="Guest" value={data.guestName} />
              <DetailRow
                label="Date"
                value={formatDate(data.date)}
                icon={<Calendar size={14} className="text-navy-300" />}
              />
              <DetailRow
                label="Time"
                value={formatTime(data.date)}
                icon={<Clock size={14} className="text-navy-300" />}
              />
              {data.endDate && (
                <DetailRow label="End Date" value={formatDate(data.endDate)} />
              )}
              <DetailRow
                label="Guests"
                value={`${data.guestCount} guest${data.guestCount > 1 ? "s" : ""}`}
                icon={<Users size={14} className="text-navy-300" />}
              />
              <DetailRow label="Operator" value={data.operatorName} />
              {data.listingAddress && (
                <DetailRow
                  label="Location"
                  value={data.listingAddress}
                  icon={<MapPin size={14} className="text-navy-300" />}
                />
              )}
              {data.discountAmount && parseFloat(data.discountAmount) > 0 && (
                <DetailRow
                  label="Discount"
                  value={`-${currencySymbol}${parseFloat(data.discountAmount).toFixed(2)}`}
                  highlight="green"
                />
              )}
              <div className="flex justify-between items-center py-3 border-t border-cream-200">
                <span className="text-sm font-semibold text-navy-700 uppercase tracking-wider">
                  Total Paid
                </span>
                <span className="text-2xl font-bold text-gold-600">
                  {currencySymbol}{parseFloat(data.totalAmount).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Instruction */}
            <div className="bg-teal-50 text-center px-8 py-4">
              <p className="text-sm font-semibold text-teal-700">
                Show this voucher to your operator upon arrival
              </p>
            </div>

            {/* Calendar Links - hidden when printing */}
            <div className="print:hidden px-8 py-5 border-t border-cream-100">
              <p className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CalendarPlus size={14} />
                Add to Calendar
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={getGoogleCalendarUrl(data)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-4 py-2 bg-cream-50 hover:bg-cream-100 text-navy-600 text-sm font-medium rounded-lg transition-colors"
                >
                  Google Calendar
                </a>
                <button
                  onClick={() => downloadICS(data)}
                  className="flex-1 text-center px-4 py-2 bg-cream-50 hover:bg-cream-100 text-navy-600 text-sm font-medium rounded-lg transition-colors"
                >
                  Apple / Outlook
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-navy-800 text-center py-3">
              <p className="text-xs text-cream-300/50">
                Powered by VakayGo &mdash; vakaygo.com
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="print:hidden">
        <Footer />
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: "green";
}) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-cream-100 last:border-b-0">
      <span className="text-xs font-medium text-navy-400 uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-right max-w-[60%] ${
          highlight === "green" ? "text-green-600" : "text-navy-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
