"use client";

import { useEffect, useState } from "react";
import {
  Flag,
  Loader2,
  AlertCircle,
  CheckCircle,
  Eye,
  XCircle,
  Clock,
  User,
  FileText,
  Star,
  ListPlus,
} from "lucide-react";

type Report = {
  id: string;
  reporterEmail: string;
  reporterName: string | null;
  targetType: "listing" | "user" | "review";
  targetId: string;
  reason: string;
  description: string | null;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
};

const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "bg-amber-100", color: "text-amber-700", label: "Pending" },
  resolved: { bg: "bg-green-100", color: "text-green-700", label: "Resolved" },
  dismissed: { bg: "bg-gray-100", color: "text-gray-600", label: "Dismissed" },
};

const targetIcons: Record<string, typeof User> = {
  listing: ListPlus,
  user: User,
  review: Star,
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "resolved" | "dismissed">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/reports")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setReports(data.reports || data);
      })
      .catch(() => setError("Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(id: string, action: "resolved" | "dismissed") {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: action } : r))
        );
        setSuccess(`Report ${action}.`);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update report");
      }
    } catch {
      setError("Something went wrong.");
    }
  }

  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);
  const pendingCount = reports.filter((r) => r.status === "pending").length;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-gold-700" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reported Content
        </h1>
        <p className="text-navy-400 mt-1">
          Review and manage user reports.
          {pendingCount > 0 && (
            <span className="ml-2 text-amber-600 font-semibold">
              {pendingCount} pending
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "pending", "resolved", "dismissed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
              filter === tab
                ? "bg-gold-700 text-white"
                : "bg-white text-navy-500 hover:bg-cream-100 shadow-[var(--shadow-card)]"
            }`}
          >
            {tab}
            {tab === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/25 px-1 text-xs">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reports Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <Flag className="w-12 h-12 text-navy-200 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-navy-700 mb-2">No reports</h2>
          <p className="text-sm text-navy-400">
            {filter === "all" ? "No reports have been submitted yet." : `No ${filter} reports.`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200">
                  <th className="px-6 py-4 font-semibold text-navy-500">Reporter</th>
                  <th className="px-6 py-4 font-semibold text-navy-500">Target</th>
                  <th className="px-6 py-4 font-semibold text-navy-500">Reason</th>
                  <th className="px-6 py-4 font-semibold text-navy-500">Status</th>
                  <th className="px-6 py-4 font-semibold text-navy-500">Date</th>
                  <th className="px-6 py-4 font-semibold text-navy-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((report) => {
                  const status = statusConfig[report.status];
                  const TargetIcon = targetIcons[report.targetType] || FileText;
                  const isExpanded = expandedId === report.id;

                  return (
                    <>
                      <tr
                        key={report.id}
                        className="border-b border-cream-100 last:border-0 hover:bg-cream-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : report.id)}
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-navy-700">
                            {report.reporterName || "Anonymous"}
                          </p>
                          <p className="text-xs text-navy-400">{report.reporterEmail}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-cream-100 text-navy-600 px-2 py-1 rounded-lg capitalize">
                            <TargetIcon size={12} />
                            {report.targetType}
                          </span>
                          <p className="text-xs text-navy-400 mt-0.5 font-mono">
                            {report.targetId.slice(0, 8)}...
                          </p>
                        </td>
                        <td className="px-6 py-4 capitalize text-navy-600">
                          {report.reason.replace("_", " ")}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${status.bg} ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-navy-400">
                          {new Date(report.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {report.status === "pending" && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAction(report.id, "resolved");
                                }}
                                className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                                title="Resolve"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAction(report.id, "dismissed");
                                }}
                                className="p-2 rounded-lg text-navy-400 hover:bg-gray-100 transition-colors"
                                title="Dismiss"
                              >
                                <XCircle size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && report.description && (
                        <tr key={`${report.id}-desc`} className="border-b border-cream-100 bg-cream-50">
                          <td colSpan={6} className="px-6 py-4">
                            <p className="text-sm text-navy-500">
                              <span className="font-semibold text-navy-600">Description:</span>{" "}
                              {report.description}
                            </p>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
