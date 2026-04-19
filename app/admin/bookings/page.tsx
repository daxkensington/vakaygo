"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarCheck, Loader2, ChevronLeft, ChevronRight, Search, Download } from "lucide-react";

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
  travelerName: string | null;
  travelerEmail: string;
  operatorName: string | null;
  operatorEmail: string;
};

type BookingsResponse = {
  bookings: Booking[];
  total: number;
  page: number;
  totalPages: number;
};

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-purple-100 text-purple-700",
  no_show: "bg-gray-100 text-gray-600",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(parseFloat(amount));
}

export default function AdminBookingsPage() {
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchBookings = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    fetch(`/api/admin/bookings?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CalendarCheck className="h-7 w-7 text-gold-700" />
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bookings
          </h1>
          {data && (
            <span className="ml-2 rounded-full bg-cream-100 px-3 py-1 text-sm font-semibold text-navy-500">
              {data.total.toLocaleString()} total
            </span>
          )}
        </div>
        <button
          onClick={() => window.open("/api/admin/export?type=bookings", "_blank")}
          className="inline-flex items-center gap-2 rounded-xl bg-navy-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Status Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleStatusChange(tab.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-navy-700 text-white"
                : "bg-white text-navy-600 hover:bg-cream-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Range Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-navy-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-navy-700 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-navy-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-navy-700 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
            className="text-sm text-navy-400 hover:text-navy-600 underline"
          >
            Clear dates
          </button>
        )}
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gold-700" />
          </div>
        ) : !data || data.bookings.length === 0 ? (
          <div className="py-20 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-navy-200" />
            <p className="text-navy-400">No bookings found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 bg-cream-50">
                    <th className="px-4 py-3 text-left font-semibold text-navy-500">Booking #</th>
                    <th className="px-4 py-3 text-left font-semibold text-navy-500">Listing</th>
                    <th className="px-4 py-3 text-left font-semibold text-navy-500">Traveler</th>
                    <th className="px-4 py-3 text-left font-semibold text-navy-500">Operator</th>
                    <th className="px-4 py-3 text-left font-semibold text-navy-500">Dates</th>
                    <th className="px-4 py-3 text-center font-semibold text-navy-500">Guests</th>
                    <th className="px-4 py-3 text-right font-semibold text-navy-500">Amount</th>
                    <th className="px-4 py-3 text-center font-semibold text-navy-500">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-navy-500">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-cream-100 transition-colors hover:bg-cream-50"
                    >
                      <td className="px-4 py-3 font-medium text-navy-700">
                        #{b.bookingNumber}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-navy-600">
                        {b.listingTitle}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-navy-700">{b.travelerName ?? "--"}</div>
                        <div className="text-xs text-navy-400">{b.travelerEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-navy-700">{b.operatorName ?? "--"}</div>
                        <div className="text-xs text-navy-400">{b.operatorEmail}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-navy-600">
                        {formatDate(b.startDate)}
                        {b.endDate && ` - ${formatDate(b.endDate)}`}
                      </td>
                      <td className="px-4 py-3 text-center text-navy-600">{b.guestCount}</td>
                      <td className="px-4 py-3 text-right font-bold text-navy-700">
                        {formatCurrency(b.totalAmount, b.currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                            STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {b.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-navy-400">
                        {formatDate(b.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-cream-200 px-4 py-3">
                <p className="text-sm text-navy-400">
                  Page {data.page} of {data.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={data.page <= 1}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-navy-600 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={data.page >= data.totalPages}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-navy-600 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
