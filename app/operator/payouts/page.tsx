"use client";

import Link from "next/link";
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
  Globe,
  ShieldCheck,
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

type PayoutListing = {
  listingId: string;
  listingTitle: string;
  islandName: string | null;
  listingStatus?: string;
  claimVerified?: boolean;
  businessLegalName?: string;
  businessCountry?: string;
  representativeName?: string;
  stripeConnected?: boolean;
  payoutProfile?: {
    id: string;
    payoutMethod: "paypal" | "wise" | "bank_wire";
    payoutCurrency: string;
    paypalEmail: string | null;
    wiseRecipientEmail: string | null;
    wiseAccountId: string | null;
    bankName: string | null;
    bankCountry: string | null;
    bankAccountHolder: string | null;
    bankAccountNumberMasked: string | null;
    bankSwiftBic: string | null;
    bankRoutingOrBranch: string | null;
    w8benCertified: boolean;
    w8benBeneficialOwner: string | null;
    w8benCountry: string | null;
    w8benSignedName: string | null;
    status: string;
  } | null;
};

type PayoutData = {
  availableBalance: number;
  totalEarned: number;
  pendingAmount: number;
  payouts: Payout[];
  recentEarnings: Earning[];
  listings?: PayoutListing[];
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
    currency: "USD",
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
  const [selectedListingId, setSelectedListingId] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"paypal" | "wise" | "bank_wire">("wise");
  const [payoutCurrency, setPayoutCurrency] = useState("USD");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCountry, setBankCountry] = useState("GD");
  const [swiftBic, setSwiftBic] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [w8benCountryOfResidence, setW8benCountryOfResidence] = useState("GD");
  const [w8benSignerName, setW8benSignerName] = useState("");
  const [w8benCertified, setW8benCertified] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");

  function hydrateListingForm(item: PayoutListing | undefined) {
    if (!item) return;
    const p = item.payoutProfile;
    if (p?.payoutMethod === "paypal" || p?.payoutMethod === "wise" || p?.payoutMethod === "bank_wire") {
      setPayoutMethod(p.payoutMethod);
    }
    if (p?.payoutCurrency) {
      setPayoutCurrency(p.payoutCurrency);
    }
    setBeneficiaryName(p?.bankAccountHolder || p?.w8benBeneficialOwner || item.businessLegalName || "");
    setBeneficiaryEmail(p?.wiseRecipientEmail || p?.paypalEmail || "");
    setBankName(p?.bankName || "");
    setBankCountry(p?.bankCountry || item.businessCountry || "GD");
    setSwiftBic(p?.bankSwiftBic || "");
    setRoutingNumber(p?.bankRoutingOrBranch || "");
    setW8benCountryOfResidence(p?.w8benCountry || item.businessCountry || "GD");
    setW8benSignerName(p?.w8benSignedName || item.representativeName || "");
    setW8benCertified(Boolean(p?.w8benCertified));
  }

  useEffect(() => {
    async function fetchPayouts() {
      try {
        const res = await fetch("/api/operator/payouts");
        if (!res.ok) throw new Error("Failed to load");
        const json: PayoutData = await res.json();
        setData(json);
        const list = json.listings || [];
        const queryListingId =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("listingId")
            : null;
        const initial =
          list.find((l) => l.listingId === queryListingId) || list[0];
        if (initial) {
          setSelectedListingId(initial.listingId);
          hydrateListingForm(initial);
        }
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
        <Loader2 size={32} className="animate-spin text-gold-700" />
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
    listings: listingItems = [],
  } = data || {};

  const selectedListing = listingItems.find((l) => l.listingId === selectedListingId) || listingItems[0];

  async function handleSavePayoutProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedListing) return;
    setSavingProfile(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const res = await fetch("/api/operator/payout-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: selectedListing.listingId,
          payoutMethod,
          payoutCurrency,
          paypalEmail: payoutMethod === "paypal" ? beneficiaryEmail : null,
          wiseRecipientEmail: payoutMethod === "wise" ? beneficiaryEmail : null,
          bankName: payoutMethod === "bank_wire" ? bankName : null,
          bankCountry: payoutMethod === "bank_wire" ? bankCountry : null,
          bankAccountHolder: beneficiaryName,
          bankAccountNumber: payoutMethod === "bank_wire" ? accountNumber : null,
          bankSwiftBic: payoutMethod === "bank_wire" ? swiftBic : null,
          bankRoutingOrBranch: routingNumber || null,
          w8benCertified,
          w8benBeneficialOwner: beneficiaryName,
          w8benCountry: w8benCountryOfResidence,
          w8benSignedName: w8benSignerName,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Unable to save payout profile.");
      }
      setProfileNotice("Payout profile & Form W-8BEN certification saved for compliance verification.");
      setAccountNumber("");
      const refreshed = await fetch("/api/operator/payouts");
      if (refreshed.ok) {
        const refreshedJson: PayoutData = await refreshed.json();
        setData(refreshedJson);
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Unable to save payout profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  function handleExportCsv() {
    const rows = [
      ["Booking Number", "Listing", "Gross USD", "Platform Fee USD", "Net USD", "Completed Date"],
      ...recentEarnings.map((e) => [
        e.bookingNumber,
        `"${(e.listingTitle || "").replace(/"/g, '""')}"`,
        e.totalAmount.toFixed(2),
        e.serviceFee.toFixed(2),
        e.netAmount.toFixed(2),
        e.completedAt,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vakaygo-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

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
            Track your earnings, payout history, and Caribbean multi-rail settlement setup
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="flex items-center gap-2 bg-white text-navy-600 px-4 py-2.5 rounded-xl shadow-sm hover:bg-cream-50 transition-colors text-sm font-medium"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Earnings Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gold-50 rounded-xl flex items-center justify-center">
              <DollarSign size={20} className="text-gold-700" />
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

      {/* Payout Method & Caribbean Multi-Rail Settlement Setup */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-bold text-navy-700 flex items-center gap-2">
              <Globe size={18} className="text-teal-600" />
              Caribbean &amp; International Payout Setup
            </h2>
            <p className="text-sm text-navy-400 mt-1">
              Operators across all 21 Caribbean islands can receive 48h post-trip escrow payouts in USD via Wise, PayPal, or Bank Wire (SWIFT / ACH) when Stripe Connect is unavailable locally.
            </p>
          </div>
          <Link
            href={selectedListing ? `/operator/onboarding/${selectedListing.listingId}` : "/operator/listings"}
            className="bg-gold-700 hover:bg-gold-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >
            Review onboarding
          </Link>
        </div>

        {listingItems.length === 0 ? (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-cream-50">
            <CreditCard size={24} className="text-navy-300" />
            <div className="flex-1">
              <p className="text-navy-700 font-medium">No operator listings found yet</p>
              <p className="text-sm text-navy-400">
                Claim or create a listing first to configure its payout account and Form W-8BEN certification.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSavePayoutProfile} className="space-y-4 border-t border-cream-200 pt-4">
            {profileNotice && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                {profileNotice}
              </div>
            )}
            {profileError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {profileError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                  Listing
                </label>
                <select
                  value={selectedListing?.listingId || ""}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedListingId(nextId);
                    hydrateListingForm(listingItems.find((l) => l.listingId === nextId));
                  }}
                  className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                >
                  {listingItems.map((item) => (
                    <option key={item.listingId} value={item.listingId}>
                      {item.listingTitle} {item.islandName ? `(${item.islandName})` : ""} —{" "}
                      {item.payoutProfile?.status ? item.payoutProfile.status.toUpperCase() : "NOT CONFIGURED"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                  Payout Rail
                </label>
                <select
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value as "paypal" | "wise" | "bank_wire")}
                  className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                >
                  <option value="wise">Wise (USD / Multi-Currency Account)</option>
                  <option value="paypal">PayPal (USD Mass Payout)</option>
                  <option value="bank_wire">Bank Wire (SWIFT / Local Bank)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                  Settlement Currency
                </label>
                <select
                  value={payoutCurrency}
                  onChange={(e) => setPayoutCurrency(e.target.value)}
                  className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="XCD">XCD — Eastern Caribbean Dollar</option>
                  <option value="BBD">BBD — Barbadian Dollar</option>
                  <option value="JMD">JMD — Jamaican Dollar</option>
                  <option value="KYD">KYD — Cayman Islands Dollar</option>
                  <option value="TTD">TTD — Trinidad &amp; Tobago Dollar</option>
                  <option value="DOP">DOP — Dominican Peso</option>
                  <option value="BSD">BSD — Bahamian Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                  Beneficiary Legal / Account Holder Name
                </label>
                <input
                  required
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="Legal company or individual account holder name"
                  className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                />
              </div>

              {(payoutMethod === "paypal" || payoutMethod === "wise") && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                    {payoutMethod === "paypal" ? "PayPal Account Email" : "Wise Account Email"}
                  </label>
                  <input
                    type="email"
                    required
                    value={beneficiaryEmail}
                    onChange={(e) => setBeneficiaryEmail(e.target.value)}
                    placeholder="payouts@yourbusiness.com"
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                  />
                </div>
              )}
            </div>

            {(payoutMethod === "bank_wire" || payoutMethod === "wise") && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                    Bank Name {payoutMethod === "bank_wire" ? "*" : "(Optional)"}
                  </label>
                  <input
                    required={payoutMethod === "bank_wire"}
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Republic Bank / CIBC Caribbean"
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                    Bank Country ISO
                  </label>
                  <input
                    maxLength={2}
                    value={bankCountry}
                    onChange={(e) => setBankCountry(e.target.value.toUpperCase())}
                    placeholder="GD"
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                    SWIFT / BIC or Routing
                  </label>
                  <input
                    value={swiftBic || routingNumber}
                    onChange={(e) => {
                      setSwiftBic(e.target.value.toUpperCase());
                      setRoutingNumber(e.target.value);
                    }}
                    placeholder="8 or 11 char SWIFT/BIC"
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                    Account / IBAN {selectedListing?.payoutProfile?.bankAccountNumberMasked ? `(Saved ${selectedListing.payoutProfile.bankAccountNumberMasked})` : ""}
                  </label>
                  <input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder={selectedListing?.payoutProfile?.bankAccountNumberMasked ? `Saved ${selectedListing.payoutProfile.bankAccountNumberMasked}` : "Account number or IBAN"}
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-navy-700"
                  />
                </div>
              </div>
            )}

            <div className="rounded-xl bg-cream-50 p-4 border border-cream-200 space-y-3">
              <div className="flex items-center gap-2 text-navy-700 font-semibold text-sm">
                <ShieldCheck size={18} className="text-teal-600" />
                Form W-8BEN / W-8BEN-E Foreign Status Certification (Non-US Caribbean Operators)
              </div>
              <p className="text-xs text-navy-500">
                Under IRC § 862(a)(3), hospitality, charter, and tour services performed outside the United States by a non-US operator are foreign-source income subject to 0% US federal tax withholding.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                    Country of Tax Residence (ISO 2-Letter Code, e.g. GD, JM, BB, KY)
                  </label>
                  <input
                    required
                    maxLength={2}
                    value={w8benCountryOfResidence}
                    onChange={(e) => setW8benCountryOfResidence(e.target.value.toUpperCase())}
                    placeholder="GD"
                    className="w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm text-navy-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                    Authorized Signer Full Name
                  </label>
                  <input
                    required
                    value={w8benSignerName}
                    onChange={(e) => setW8benSignerName(e.target.value)}
                    placeholder="Full legal name of authorized signer"
                    className="w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm text-navy-700"
                  />
                </div>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-navy-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={w8benCertified}
                  onChange={(e) => setW8benCertified(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I certify under penalties of perjury that the beneficial owner is not a U.S. person, that all hospitality, accommodation, or tour services for this listing are performed outside the United States, and that the payout details provided above belong to the verified business owner.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-navy-400">
                Current Status:{" "}
                <strong className="text-navy-700">
                  {selectedListing?.payoutProfile?.status ? selectedListing.payoutProfile.status.toUpperCase() : "NOT SUBMITTED"}
                </strong>
              </span>
              <button
                type="submit"
                disabled={savingProfile}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                {savingProfile ? "Saving Payout Profile..." : "Save Payout Profile & W-8BEN"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Payout Schedule */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-8">
        <h2 className="font-bold text-navy-700 mb-2">Payout Schedule</h2>
        <p className="text-sm text-navy-400">
          Payout availability depends on verified account status and the payment provider&apos;s settlement schedule. Pending ledger entries do not confirm arrival in your bank account.
        </p>
        <div className="mt-4 p-4 bg-teal-50 rounded-xl">
          <p className="text-sm text-teal-700">
            <span className="font-semibold">
              Fees depend on the listing category
            </span>{" "}
            Review the <Link href="/operator/onboarding/terms" className="underline">operator terms draft</Link> for the current commission schedule.
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
