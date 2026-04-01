"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Save,
} from "lucide-react";

type Dispute = {
  id: string;
  bookingId: string;
  status: string;
  reason: string;
  description: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  bookingNumber: string;
  travelerName: string | null;
  travelerEmail: string;
};

type DisputeDetail = {
  id: string;
  bookingId: string;
  filedBy: string;
  operatorId: string;
  status: string;
  reason: string;
  description: string;
  adminNotes: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  bookingNumber: string;
  bookingStatus: string;
  startDate: string;
  totalAmount: string;
  guestCount: number;
  traveler: { id: string; name: string | null; email: string };
  operator: {
    id: string;
    name: string | null;
    email: string;
    businessName: string | null;
  };
  listing: { title: string; type: string } | null;
};

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  open: { label: "Open", color: "text-amber-700", bg: "bg-amber-50" },
  under_review: {
    label: "Under Review",
    color: "text-blue-700",
    bg: "bg-blue-50",
  },
  resolved_traveler: {
    label: "Resolved (Traveler)",
    color: "text-green-700",
    bg: "bg-green-50",
  },
  resolved_operator: {
    label: "Resolved (Operator)",
    color: "text-teal-700",
    bg: "bg-teal-50",
  },
  closed: { label: "Closed", color: "text-gray-700", bg: "bg-gray-100" },
};

const reasonConfig: Record<string, { label: string; color: string; bg: string }> =
  {
    no_show: { label: "No Show", color: "text-red-700", bg: "bg-red-50" },
    poor_quality: {
      label: "Poor Quality",
      color: "text-amber-700",
      bg: "bg-amber-50",
    },
    wrong_listing: {
      label: "Wrong Listing",
      color: "text-orange-700",
      bg: "bg-orange-50",
    },
    overcharged: {
      label: "Overcharged",
      color: "text-red-700",
      bg: "bg-red-50",
    },
    safety_concern: {
      label: "Safety Concern",
      color: "text-red-700",
      bg: "bg-red-50",
    },
    other: { label: "Other", color: "text-gray-700", bg: "bg-gray-100" },
  };

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "under_review", label: "Under Review" },
  { key: "resolved", label: "Resolved" },
];

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DisputeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Resolution form state
  const [formStatus, setFormStatus] = useState("");
  const [formResolution, setFormResolution] = useState("");
  const [formAdminNotes, setFormAdminNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchDisputes = useCallback(async () => {
    try {
      const res = await fetch("/api/disputes");
      const data = await res.json();
      setDisputes(data.disputes || []);
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  async function loadDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/disputes/${id}`);
      const data = await res.json();
      setDetail(data.dispute);
      setFormStatus(data.dispute.status);
      setFormResolution(data.dispute.resolution || "");
      setFormAdminNotes(data.dispute.adminNotes || "");
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/disputes/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: formStatus,
          resolution: formResolution || null,
          adminNotes: formAdminNotes || null,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        // Refresh list and detail
        fetchDisputes();
        const data = await fetch(`/api/disputes/${detail.id}`).then((r) =>
          r.json()
        );
        setDetail(data.dispute);
        setFormStatus(data.dispute.status);
        setFormResolution(data.dispute.resolution || "");
        setFormAdminNotes(data.dispute.adminNotes || "");
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  // Filtered disputes
  const filtered = disputes.filter((d) => {
    if (filter === "open" && d.status !== "open") return false;
    if (filter === "under_review" && d.status !== "under_review") return false;
    if (
      filter === "resolved" &&
      !["resolved_traveler", "resolved_operator", "closed"].includes(d.status)
    )
      return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        d.bookingNumber.toLowerCase().includes(q) ||
        (d.travelerName || "").toLowerCase().includes(q) ||
        d.travelerEmail.toLowerCase().includes(q) ||
        d.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    open: disputes.filter((d) => d.status === "open").length,
    underReview: disputes.filter((d) => d.status === "under_review").length,
    resolved: disputes.filter((d) =>
      ["resolved_traveler", "resolved_operator", "closed"].includes(d.status)
    ).length,
    total: disputes.length,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-navy-800"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Disputes
        </h1>
        <p className="text-navy-400 mt-1">
          Review and resolve traveler-reported issues
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Open",
            value: stats.open,
            icon: AlertTriangle,
            color: "text-amber-500",
            bg: "bg-amber-50",
          },
          {
            label: "Under Review",
            value: stats.underReview,
            icon: Eye,
            color: "text-blue-500",
            bg: "bg-blue-50",
          },
          {
            label: "Resolved",
            value: stats.resolved,
            icon: CheckCircle,
            color: "text-green-500",
            bg: "bg-green-50",
          },
          {
            label: "Total",
            value: stats.total,
            icon: Clock,
            color: "text-navy-500",
            bg: "bg-navy-50",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}
              >
                <stat.icon size={20} className={stat.color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-navy-800">{stat.value}</p>
                <p className="text-xs text-navy-400">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-[var(--shadow-card)]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.key
                  ? "bg-gold-500 text-white"
                  : "text-navy-500 hover:bg-cream-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300"
          />
          <input
            type="text"
            placeholder="Search by booking #, traveler, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-cream-200 rounded-xl text-sm text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent bg-white"
          />
        </div>
      </div>

      {/* Disputes table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <AlertTriangle size={48} className="text-navy-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-navy-700">No disputes found</h3>
          <p className="text-navy-400 mt-2">
            {search || filter !== "all"
              ? "Try adjusting your filters"
              : "No disputes have been filed yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((dispute) => {
            const status =
              statusConfig[dispute.status] || statusConfig.open;
            const reason =
              reasonConfig[dispute.reason] || reasonConfig.other;
            const isExpanded = expandedId === dispute.id;

            return (
              <div
                key={dispute.id}
                className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden"
              >
                {/* Row */}
                <button
                  onClick={() => loadDetail(dispute.id)}
                  className="w-full text-left px-6 py-4 hover:bg-cream-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-navy-500">
                          #{dispute.bookingNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${reason.bg} ${reason.color}`}
                        >
                          {reason.label}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.bg} ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-navy-400 mt-1">
                        Filed by{" "}
                        <span className="font-medium text-navy-600">
                          {dispute.travelerName || dispute.travelerEmail}
                        </span>{" "}
                        &middot;{" "}
                        {new Date(dispute.createdAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp size={18} className="text-navy-400" />
                      ) : (
                        <ChevronDown size={18} className="text-navy-400" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-cream-200 px-6 py-5">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2
                          size={24}
                          className="animate-spin text-gold-500"
                        />
                      </div>
                    ) : detail ? (
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Left: details */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-1">
                              Description
                            </h4>
                            <p className="text-sm text-navy-600 leading-relaxed">
                              {detail.description}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-1">
                                Booking
                              </h4>
                              <p className="text-sm text-navy-600">
                                #{detail.bookingNumber}
                              </p>
                              <p className="text-xs text-navy-400">
                                {detail.listing?.title} ({detail.listing?.type})
                              </p>
                              <p className="text-xs text-navy-400">
                                Status: {detail.bookingStatus} &middot; $
                                {parseFloat(detail.totalAmount).toFixed(2)}
                              </p>
                              <p className="text-xs text-navy-400">
                                {new Date(detail.startDate).toLocaleDateString()} &middot;{" "}
                                {detail.guestCount} guest
                                {detail.guestCount > 1 ? "s" : ""}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-1">
                                Parties
                              </h4>
                              <p className="text-sm text-navy-600">
                                {detail.traveler.name || "Unknown"}{" "}
                                <span className="text-navy-400">
                                  (traveler)
                                </span>
                              </p>
                              <p className="text-xs text-navy-400">
                                {detail.traveler.email}
                              </p>
                              <p className="text-sm text-navy-600 mt-1">
                                {detail.operator.businessName ||
                                  detail.operator.name ||
                                  "Unknown"}{" "}
                                <span className="text-navy-400">
                                  (operator)
                                </span>
                              </p>
                              <p className="text-xs text-navy-400">
                                {detail.operator.email}
                              </p>
                            </div>
                          </div>

                          {detail.resolvedAt && (
                            <div>
                              <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-1">
                                Resolved
                              </h4>
                              <p className="text-xs text-navy-400">
                                {new Date(
                                  detail.resolvedAt
                                ).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Right: resolution form */}
                        <div className="bg-cream-50 rounded-xl p-5 space-y-4">
                          <h4 className="text-sm font-semibold text-navy-700">
                            Resolution
                          </h4>

                          <div>
                            <label className="text-xs font-medium text-navy-500 mb-1 block">
                              Status
                            </label>
                            <select
                              value={formStatus}
                              onChange={(e) => setFormStatus(e.target.value)}
                              className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm text-navy-700 bg-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                            >
                              <option value="open">Open</option>
                              <option value="under_review">Under Review</option>
                              <option value="resolved_traveler">
                                Resolved (Traveler Wins)
                              </option>
                              <option value="resolved_operator">
                                Resolved (Operator Wins)
                              </option>
                              <option value="closed">Closed</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-medium text-navy-500 mb-1 block">
                              Resolution Message
                            </label>
                            <textarea
                              value={formResolution}
                              onChange={(e) =>
                                setFormResolution(e.target.value)
                              }
                              placeholder="Explain the outcome to both parties..."
                              rows={3}
                              className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm text-navy-700 placeholder:text-navy-300 bg-white focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-medium text-navy-500 mb-1 block">
                              Admin Notes{" "}
                              <span className="text-navy-300 font-normal">
                                (internal)
                              </span>
                            </label>
                            <textarea
                              value={formAdminNotes}
                              onChange={(e) =>
                                setFormAdminNotes(e.target.value)
                              }
                              placeholder="Internal notes (not shared with users)"
                              rows={2}
                              className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm text-navy-700 placeholder:text-navy-300 bg-white focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none"
                            />
                          </div>

                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            {saving ? (
                              <Loader2
                                size={16}
                                className="animate-spin"
                              />
                            ) : (
                              <Save size={16} />
                            )}
                            {saving ? "Saving..." : "Save Changes"}
                          </button>

                          {saveSuccess && (
                            <p className="text-sm text-green-600 text-center flex items-center justify-center gap-1">
                              <CheckCircle size={14} /> Saved successfully
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-red-500 text-center py-4">
                        Failed to load dispute details
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
