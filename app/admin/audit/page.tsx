"use client";

import { useState, useEffect, useCallback } from "react";
import { ClipboardList, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Filter, Loader2 } from "lucide-react";

interface AuditEntry {
  id: number;
  adminId: string;
  adminName: string | null;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_BADGES: Record<string, { label: string; color: string }> = {
  approve_listing: { label: "Approve", color: "bg-emerald-100 text-emerald-700" },
  reject_listing: { label: "Reject", color: "bg-red-100 text-red-700" },
  pause_listing: { label: "Pause", color: "bg-amber-100 text-amber-700" },
  feature_listing: { label: "Feature", color: "bg-blue-100 text-blue-700" },
  unfeature_listing: { label: "Unfeature", color: "bg-slate-100 text-slate-600" },
  delete_listing: { label: "Delete", color: "bg-red-100 text-red-700" },
  change_role: { label: "Role Change", color: "bg-blue-100 text-blue-700" },
  bulk_approve: { label: "Bulk Approve", color: "bg-purple-100 text-purple-700" },
  bulk_reject: { label: "Bulk Reject", color: "bg-purple-100 text-purple-700" },
  bulk_pause: { label: "Bulk Pause", color: "bg-purple-100 text-purple-700" },
  bulk_delete: { label: "Bulk Delete", color: "bg-purple-100 text-purple-700" },
};

const ACTION_OPTIONS = [
  "approve_listing",
  "reject_listing",
  "pause_listing",
  "feature_listing",
  "unfeature_listing",
  "delete_listing",
  "change_role",
  "bulk_approve",
  "bulk_reject",
  "bulk_pause",
  "bulk_delete",
];

const TARGET_TYPE_OPTIONS = ["listing", "user", "booking", "payout"];

function ActionBadge({ action }: { action: string }) {
  const badge = ACTION_BADGES[action] || { label: action, color: "bg-slate-100 text-slate-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}>
      {badge.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (actionFilter) params.set("action", actionFilter);
      if (targetTypeFilter) params.set("targetType", targetTypeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, targetTypeFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, targetTypeFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold text-navy-800 md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Audit Log
          </h1>
          <p className="mt-1 text-sm text-navy-400">
            {total.toLocaleString()} total entries
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-800 text-gold-400">
          <ClipboardList className="h-6 w-6" />
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-navy-600">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-700 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
          >
            <option value="">All Actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_BADGES[a]?.label || a}
              </option>
            ))}
          </select>

          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-700 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
          >
            <option value="">All Target Types</option>
            {TARGET_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From date"
            className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-700 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To date"
            className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-700 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-navy-200" />
            <p className="mt-3 text-navy-400">No audit log entries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50 text-left text-xs font-medium uppercase tracking-wider text-navy-400">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className="cursor-pointer transition-colors hover:bg-cream-50"
                      onClick={() =>
                        setExpandedRow(expandedRow === log.id ? null : log.id)
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-navy-500">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-navy-700">
                          {log.adminName || "Unknown"}
                        </div>
                        <div className="text-xs text-navy-400">
                          {log.adminEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-navy-500">
                          {log.targetType}
                        </span>
                        {log.targetId && (
                          <span className="ml-1 font-mono text-xs text-navy-400">
                            {log.targetId.length > 12
                              ? `${log.targetId.slice(0, 8)}...`
                              : log.targetId}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {log.details ? (
                          <button className="inline-flex items-center gap-1 text-xs text-gold-600 hover:text-gold-700">
                            {expandedRow === log.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            View
                          </button>
                        ) : (
                          <span className="text-navy-300">--</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-navy-400">
                        {log.ipAddress || "--"}
                      </td>
                    </tr>
                    {expandedRow === log.id && log.details && (
                      <tr key={`${log.id}-details`}>
                        <td colSpan={6} className="bg-cream-50 px-4 py-3">
                          <pre className="max-h-48 overflow-auto rounded-lg bg-navy-800 p-3 text-xs text-cream-100">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-cream-200 px-4 py-3">
            <p className="text-sm text-navy-400">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-cream-300 px-3 py-1.5 text-sm font-medium text-navy-600 transition-colors hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-cream-300 px-3 py-1.5 text-sm font-medium text-navy-600 transition-colors hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
