"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Download,
  CreditCard,
  Loader2,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";

type Payout = {
  id: string;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  bookingCount: number;
  paidAt: string | null;
  createdAt: string;
};

type Earning = {
  bookingNumber: string;
  listingTitle: string;
  totalAmount: number;
  serviceFee: number;
  netAmount: number;
  completedAt: string;
};

type PayoutData = {
  availableBalance: number;
  totalEarned: number;
  pendingAmount: number;
  payouts: Payout[];
  recentEarnings: Earning[];
};

const payoutStatusConfig: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700" },
  processing: {
    label: "Processing",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  completed: {
    label: "Completed",
    bg: "bg-green-50",
    text: "text-green-700",
  },
  failed: { label: "Failed", bg: "bg-red-50", text: "text-red-600" },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "XCD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OperatorPayoutsPage() {
  const [data, setData] = useState<PayoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPayouts() {
      try {
        const res = await fetch("/api/operator/payouts");
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        setData(json);
      } catch {
        setError("Failed to load payout data");
      } finally {
        setLoading(false);
      }
    }
    fetchPayouts();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-gold-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-50 rounded-2xl p-8 text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  const {
    availableBalance = 0,
    totalEarned = 0,
    pendingAmount = 0,
    payouts: payoutList = [],
    recentEarnings = [],
  } = data || {};

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Payouts
          </h1>
          <p className="text-navy-400 mt-1">
            Track your earnings and payout history
          </p>
        </div>
        <button className="flex items-center gap-2 bg-white text-navy-600 px-4 py-2.5 rounded-xl shadow-sm hover:bg-cream-50 transition-colors text-sm font-medium">
          <Download size={16} />
          Export
        </button>
      </div>

      {/* Earnings Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gold-50 rounded-xl flex items-center justify-center">
              <DollarSign size={20} className="text-gold-600" />
            </div>
            <p className="text-sm text-navy-400">Available Balance</p>
          </div>
          <p className="text-3xl font-bold text-navy-700">
            {formatCurrency(availableBalance)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <ArrowUpRight size={20} className="text-teal-600" />
            </div>
            <p className="text-sm text-navy-400">Total Earned</p>
          </div>
          <p className="text-3xl font-bold text-navy-700">
            {formatCurrency(totalEarned)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-navy-50 rounded-xl flex items-center justify-center">
              <Clock size={20} className="text-navy-600" />
            </div>
            <p className="text-sm text-navy-400">Pending</p>
          </div>
          <p className="text-3xl font-bold text-navy-700">
            {formatCurrency(pendingAmount)}
          </p>
        </div>
      </div>

      {/* Payout Method */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-8">
        <h2 className="font-bold text-navy-700 mb-4">Payout Method</h2>
        <div className="flex items-center gap-4 p-4 rounded-xl bg-cream-50">
          <CreditCard size={24} className="text-navy-300" />
          <div className="flex-1">
            <p className="text-navy-700 font-medium">
              No payout method configured
            </p>
            <p className="text-sm text-navy-400">
              Add a bank account or payment method to receive payouts
            </p>
          </div>
          <button className="bg-gold-500 hover:bg-gold-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            Add Method
          </button>
        </div>
      </div>

      {/* Payout Schedule */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-8">
        <h2 className="font-bold text-navy-700 mb-2">Payout Schedule</h2>
        <p className="text-sm text-navy-400">
          Payouts are processed{" "}
          <span className="font-semibold text-navy-600">weekly</span> every
          Monday for all completed bookings. Funds typically arrive within 2-3
          business days.
        </p>
        <div className="mt-4 p-4 bg-teal-50 rounded-xl">
          <p className="text-sm text-teal-700">
            <span className="font-semibold">
              VakayGo takes just 3-5% commission
            </span>{" "}
            — the lowest in the travel industry. You keep 95-97% of every booking.
          </p>
        </div>
      </div>

      {/* Recent Earnings */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] mb-8">
        <div className="p-6 pb-4">
          <h2 className="font-bold text-navy-700">Recent Earnings</h2>
          <p className="text-sm text-navy-400 mt-1">
            Completed bookings and their earnings breakdown
          </p>
        </div>

        {recentEarnings.length === 0 ? (
          <div className="px-6 pb-8 pt-4 text-center">
            <DollarSign size={32} className="text-navy-200 mx-auto mb-3" />
            <p className="text-navy-400 text-sm">
              No completed bookings yet. Earnings will appear here once guests
              complete their experiences.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-t border-cream-100">
                  <th className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Booking
                  </th>
                  <th className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Listing
                  </th>
                  <th className="text-right text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Gross
                  </th>
                  <th className="text-right text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Platform Fee
                  </th>
                  <th className="text-right text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Net Amount
                  </th>
                  <th className="text-right text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {recentEarnings.map((earning) => (
                  <tr
                    key={earning.bookingNumber}
                    className="hover:bg-cream-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-medium text-navy-600">
                        {earning.bookingNumber}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-navy-700 max-w-[200px] truncate block">
                        {earning.listingTitle}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-navy-700">
                        {formatCurrency(earning.totalAmount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-red-500">
                        -{formatCurrency(earning.serviceFee)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-semibold text-teal-700">
                        {formatCurrency(earning.netAmount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-navy-400">
                        {formatDate(earning.completedAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout History */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)]">
        <div className="p-6 pb-4">
          <h2 className="font-bold text-navy-700">Payout History</h2>
          <p className="text-sm text-navy-400 mt-1">
            All past and upcoming payouts
          </p>
        </div>

        {payoutList.length === 0 ? (
          <div className="px-6 pb-8 pt-4 text-center">
            <CheckCircle size={32} className="text-navy-200 mx-auto mb-3" />
            <p className="text-navy-400 text-sm">
              No payouts yet. Once you receive and complete bookings, your
              payouts will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-t border-cream-100">
                  <th className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Amount
                  </th>
                  <th className="text-left text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Period
                  </th>
                  <th className="text-center text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Bookings
                  </th>
                  <th className="text-center text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Status
                  </th>
                  <th className="text-right text-xs font-semibold text-navy-400 uppercase tracking-wider px-6 py-3">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {payoutList.map((payout) => {
                  const statusCfg = payoutStatusConfig[payout.status] ||
                    payoutStatusConfig.pending;
                  return (
                    <tr
                      key={payout.id}
                      className="hover:bg-cream-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-navy-700">
                          {formatCurrency(payout.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-navy-500">
                          {formatDate(payout.periodStart)} -{" "}
                          {formatDate(payout.periodEnd)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm text-navy-500">
                          {payout.bookingCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm text-navy-400">
                          {payout.paidAt
                            ? formatDate(payout.paidAt)
                            : formatDate(payout.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
