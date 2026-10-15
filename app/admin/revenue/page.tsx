"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, BarChart3, Globe, Loader2, CheckCircle, XCircle, Download } from "lucide-react";

type RevenueData = {
  totalRevenue: number;
  platformFees: number;
  avgBookingValue: number;
  byMonth: { month: string; revenue: number; count: number }[];
  byIsland: { name: string; revenue: number; count: number }[];
  byType: { type: string; revenue: number; count: number }[];
};

type AdminPayoutProfile = {
  id: string;
  listingId: string;
  listingTitle: string;
  islandName: string | null;
  operatorEmail: string;
  operatorName: string;
  businessLegalName: string | null;
  payoutMethod: string;
  payoutCurrency: string;
  status: string;
  paypalEmail: string | null;
  wiseRecipientEmail: string | null;
  bankName: string | null;
  bankCountry: string | null;
  bankAccountHolder: string | null;
  bankAccountNumberMasked: string | null;
  bankSwiftBic: string | null;
  w8benCertified: boolean;
  w8benBeneficialOwner: string | null;
  w8benCountry: string | null;
  w8benSignedName: string | null;
};

type AdminPendingPayout = {
  id: string;
  operatorId: string;
  operatorEmail: string;
  operatorName: string;
  amount: string | number;
  status: string;
  periodStart: string;
  periodEnd: string;
  bookingCount: number;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMoneyFull(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [profiles, setProfiles] = useState<AdminPayoutProfile[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<AdminPendingPayout[]>([]);
  const [busyActionId, setBusyActionId] = useState("");

  async function refreshPayoutQueue() {
    try {
      const res = await fetch("/api/admin/payout-profiles");
      if (!res.ok) return;
      const json = await res.json();
      setProfiles(json.profiles || []);
      setPendingPayouts(json.pendingPayouts || []);
    } catch {
      // Non-blocking secondary panel
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);

    async function loadRevenue() {
      try {
        const response = await fetch("/api/admin/revenue");
        if (!response.ok) {
          throw new Error("Failed to load revenue data.");
        }
        const revenue: RevenueData = await response.json();
        if (active) setData(revenue);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRevenue();
    void refreshPayoutQueue();
    return () => {
      active = false;
    };
  }, [retryAttempt]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold-700" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3">
        <p className="text-navy-400">Failed to load revenue data.</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            if (loading) return;
            setLoading(true);
            setRetryAttempt((attempt) => attempt + 1);
          }}
          className="rounded-lg border border-navy-400 px-4 py-2 font-medium text-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const maxMonthRevenue = Math.max(...data.byMonth.map((m) => m.revenue), 1);
  const maxTypeRevenue = Math.max(...data.byType.map((t) => t.revenue), 1);

  const statCards = [
    {
      label: "Total Revenue",
      value: formatMoney(data.totalRevenue),
      icon: DollarSign,
      color: "bg-gold-50 text-gold-700",
    },
    {
      label: "Platform Fees",
      value: formatMoney(data.platformFees),
      icon: TrendingUp,
      color: "bg-teal-50 text-teal-600",
    },
    {
      label: "Avg Booking Value",
      value: formatMoney(data.avgBookingValue),
      icon: BarChart3,
      color: "bg-gold-50 text-gold-700",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <DollarSign className="h-7 w-7 text-gold-700" />
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Revenue
        </h1>
      </div>

      {/* Top Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}
              >
                <s.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-3xl font-bold text-navy-700">{s.value}</p>
            <p className="mt-1 text-sm text-navy-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Monthly Revenue Chart */}
      <div className="mb-8 bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
        <h2 className="mb-6 flex items-center gap-2 font-bold text-navy-700">
          <BarChart3 className="h-5 w-5 text-gold-700" />
          Monthly Revenue
        </h2>
        {data.byMonth.length === 0 ? (
          <p className="py-8 text-center text-navy-400">No monthly data yet</p>
        ) : (
          <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: 240 }}>
            {data.byMonth.map((m) => {
              const pct = Math.max((m.revenue / maxMonthRevenue) * 100, 4);
              return (
                <div
                  key={m.month}
                  className="flex min-w-[60px] flex-1 flex-col items-center gap-2"
                >
                  <span className="text-xs font-bold text-navy-700">
                    {formatMoney(m.revenue)}
                  </span>
                  <div
                    className="w-full max-w-[48px] rounded-t-lg bg-gradient-to-t from-gold-500 to-gold-400 transition-all"
                    style={{ height: `${pct * 1.8}px` }}
                  />
                  <div className="text-center">
                    <p className="text-xs font-medium text-navy-600">{m.month}</p>
                    <p className="text-[10px] text-navy-400">
                      {m.count} booking{m.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by Island */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-navy-700">
            <Globe className="h-5 w-5 text-teal-500" />
            Revenue by Island
          </h2>
          {data.byIsland.length === 0 ? (
            <p className="py-8 text-center text-navy-400">No island data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200">
                    <th className="pb-2 text-left font-semibold text-navy-500">Island</th>
                    <th className="pb-2 text-right font-semibold text-navy-500">Revenue</th>
                    <th className="pb-2 text-right font-semibold text-navy-500">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byIsland.map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-cream-100 transition-colors hover:bg-cream-50"
                    >
                      <td className="py-2.5 font-medium text-navy-700">{row.name}</td>
                      <td className="py-2.5 text-right font-bold text-navy-700">
                        {formatMoneyFull(row.revenue)}
                      </td>
                      <td className="py-2.5 text-right text-navy-500">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Revenue by Type */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-navy-700">
            <BarChart3 className="h-5 w-5 text-gold-700" />
            Revenue by Type
          </h2>
          {data.byType.length === 0 ? (
            <p className="py-8 text-center text-navy-400">No type data yet</p>
          ) : (
            <div className="space-y-4">
              {data.byType.map((row) => {
                const pct = Math.max((row.revenue / maxTypeRevenue) * 100, 2);
                return (
                  <div key={row.type}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-navy-600">{row.type}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-navy-400">
                          {row.count} booking{row.count !== 1 ? "s" : ""}
                        </span>
                        <span className="font-bold text-navy-700">
                          {formatMoneyFull(row.revenue)}
                        </span>
                      </div>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-cream-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Caribbean Payout Profiles & Pending Operator Settlements */}
      <div className="mt-8 bg-white rounded-2xl shadow-[var(--shadow-card)] p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-navy-700">
              <Globe className="h-5 w-5 text-teal-600" />
              Caribbean Payout Profiles &amp; Operator Settlements
            </h2>
            <p className="text-sm text-navy-400 mt-1">
              Verify non-US Caribbean operator payout profiles (Wise, PayPal, Bank Wire + Form W-8BEN) and settle 48h post-trip escrow payouts.
            </p>
          </div>
          {pendingPayouts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const rows = [
                  ["Payout ID", "Operator Name", "Operator Email", "Amount USD", "Bookings", "Period Start", "Period End"],
                  ...pendingPayouts.map((p) => [
                    p.id,
                    `"${(p.operatorName || "").replace(/"/g, '""')}"`,
                    p.operatorEmail,
                    Number(p.amount).toFixed(2),
                    String(p.bookingCount),
                    p.periodStart,
                    p.periodEnd,
                  ]),
                ];
                const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `vakaygo-pending-settlements-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 rounded-xl border border-cream-300 px-3.5 py-2 text-xs font-semibold text-navy-700 hover:bg-cream-50"
            >
              <Download className="h-4 w-4" />
              Export Batch Settlement CSV
            </button>
          )}
        </div>

        {/* Payout Profiles Verification Table */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-3">
            Operator Payout Profiles ({profiles.length})
          </h3>
          {profiles.length === 0 ? (
            <p className="text-sm text-navy-400 py-4">No Caribbean payout profiles submitted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-left text-xs uppercase text-navy-400">
                    <th className="pb-2">Listing / Island</th>
                    <th className="pb-2">Operator</th>
                    <th className="pb-2">Rail &amp; Details</th>
                    <th className="pb-2">W-8BEN</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {profiles.map((prof) => (
                    <tr key={prof.id}>
                      <td className="py-3">
                        <div className="font-semibold text-navy-700">{prof.listingTitle}</div>
                        <div className="text-xs text-navy-400">{prof.islandName || "Caribbean"}</div>
                      </td>
                      <td className="py-3">
                        <div className="text-navy-700">{prof.operatorName}</div>
                        <div className="text-xs text-navy-400">{prof.operatorEmail}</div>
                      </td>
                      <td className="py-3">
                        <div className="font-medium text-navy-700 uppercase">
                          {prof.payoutMethod} ({prof.payoutCurrency})
                        </div>
                        <div className="text-xs text-navy-400">
                          {prof.bankAccountHolder || prof.w8benBeneficialOwner || prof.businessLegalName || ""}
                          {prof.wiseRecipientEmail || prof.paypalEmail ? ` · ${prof.wiseRecipientEmail || prof.paypalEmail}` : ""}
                          {prof.bankName ? ` · ${prof.bankName}` : ""}
                          {prof.bankAccountNumberMasked ? ` · ${prof.bankAccountNumberMasked}` : ""}
                        </div>
                      </td>
                      <td className="py-3 text-xs">
                        {prof.w8benCertified ? (
                          <span className="text-emerald-700 font-medium">
                            Certified ({prof.w8benCountry || "Non-US"})
                          </span>
                        ) : (
                          <span className="text-amber-700">Missing</span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-cream-100 text-navy-700 uppercase">
                          {prof.status}
                        </span>
                      </td>
                      <td className="py-3 text-right space-x-2">
                        {prof.status !== "verified" && (
                          <button
                            type="button"
                            disabled={busyActionId === prof.id}
                            onClick={async () => {
                              setBusyActionId(prof.id);
                              await fetch("/api/admin/payout-profiles", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "review_profile",
                                  profileId: prof.id,
                                  decision: "verified",
                                }),
                              });
                              await refreshPayoutQueue();
                              setBusyActionId("");
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Verify
                          </button>
                        )}
                        {prof.status !== "rejected" && (
                          <button
                            type="button"
                            disabled={busyActionId === prof.id}
                            onClick={async () => {
                              setBusyActionId(prof.id);
                              await fetch("/api/admin/payout-profiles", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "review_profile",
                                  profileId: prof.id,
                                  decision: "rejected",
                                  adminNotes: "Additional payout account verification required.",
                                }),
                              });
                              await refreshPayoutQueue();
                              setBusyActionId("");
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending Settlements Table */}
        <div className="border-t border-cream-200 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-3">
            Pending Post-Escrow Operator Settlements ({pendingPayouts.length})
          </h3>
          {pendingPayouts.length === 0 ? (
            <p className="text-sm text-navy-400 py-2">No pending operator payouts awaiting settlement.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-left text-xs uppercase text-navy-400">
                    <th className="pb-2">Operator</th>
                    <th className="pb-2">Bookings</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {pendingPayouts.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5">
                        <div className="font-medium text-navy-700">{item.operatorName}</div>
                        <div className="text-xs text-navy-400">{item.operatorEmail}</div>
                      </td>
                      <td className="py-2.5 text-navy-600">{item.bookingCount}</td>
                      <td className="py-2.5 font-bold text-navy-700">{formatMoneyFull(Number(item.amount))}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          disabled={busyActionId === item.id}
                          onClick={async () => {
                            const ref = window.prompt("Enter Wise / PayPal / Bank Wire reference ID:");
                            if (!ref) return;
                            setBusyActionId(item.id);
                            await fetch("/api/admin/payout-profiles", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "complete_payout",
                                payoutId: item.id,
                                paymentReference: ref,
                              }),
                            });
                            await refreshPayoutQueue();
                            setBusyActionId("");
                          }}
                          className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700"
                        >
                          Mark Paid
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
