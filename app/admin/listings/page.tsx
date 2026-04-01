"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Star,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Check,
  XCircle,
  Pause,
  ExternalLink,
  AlertTriangle,
  Loader2,
  ListPlus,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Listing = {
  id: string;
  title: string;
  type: string;
  status: string;
  priceAmount: string | null;
  avgRating: string;
  reviewCount: number;
  isFeatured: boolean;
  createdAt: string;
  operatorName: string | null;
  islandName: string;
};

type ListingsResponse = {
  listings: Listing[];
  total: number;
  page: number;
  totalPages: number;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending_review", label: "Pending Review" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "rejected", label: "Rejected" },
  { value: "draft", label: "Draft" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "stay", label: "Stay" },
  { value: "tour", label: "Tour" },
  { value: "dining", label: "Dining" },
  { value: "event", label: "Event" },
  { value: "transport", label: "Transport" },
  { value: "guide", label: "Guide" },
  { value: "excursion", label: "Excursion" },
  { value: "transfer", label: "Transfer" },
  { value: "vip", label: "VIP" },
];

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-slate-100 text-slate-600",
};

const TYPE_COLORS: Record<string, string> = {
  stay: "bg-blue-100 text-blue-700",
  tour: "bg-teal-100 text-teal-700",
  dining: "bg-orange-100 text-orange-700",
  event: "bg-purple-100 text-purple-700",
  transport: "bg-cyan-100 text-cyan-700",
  guide: "bg-indigo-100 text-indigo-700",
  excursion: "bg-emerald-100 text-emerald-700",
  transfer: "bg-sky-100 text-sky-700",
  vip: "bg-amber-100 text-amber-800",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusLabel(s: string) {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={i <= Math.round(rating) ? "fill-gold-400 text-gold-400" : "text-navy-200"}
        />
      ))}
      <span className="ml-1 text-xs text-navy-400">{rating.toFixed(1)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast                                                              */
/* ------------------------------------------------------------------ */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-navy-800 px-5 py-3 text-sm font-medium text-white shadow-lg animate-in slide-in-from-bottom-4">
      <Check size={16} className="text-green-400" />
      {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reject Modal                                                       */
/* ------------------------------------------------------------------ */

function RejectModal({
  listing,
  onConfirm,
  onCancel,
}: {
  listing: Listing;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-[var(--shadow-elevated)]">
        <h3
          className="mb-1 text-lg font-bold text-navy-800"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reject Listing
        </h3>
        <p className="mb-4 text-sm text-navy-400">
          Rejecting &ldquo;{listing.title}&rdquo;. Please provide a reason.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Reason for rejection..."
          className="w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-3 text-sm text-navy-700 outline-none transition-colors focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-cream-100"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim()}
            className="rounded-xl bg-red-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Actions dropdown                                                   */
/* ------------------------------------------------------------------ */

function ActionsDropdown({
  listing,
  onAction,
}: {
  listing: Listing;
  onAction: (action: string, listing: Listing) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const items = [
    listing.status !== "active" && {
      label: "Approve",
      icon: Check,
      action: "approve",
      cls: "text-green-600",
    },
    listing.status !== "rejected" && {
      label: "Reject",
      icon: XCircle,
      action: "reject",
      cls: "text-red-600",
    },
    listing.status === "active" && {
      label: "Pause",
      icon: Pause,
      action: "pause",
      cls: "text-gray-600",
    },
    {
      label: "View on site",
      icon: ExternalLink,
      action: "view",
      cls: "text-navy-600",
    },
  ].filter(Boolean) as { label: string; icon: typeof Check; action: string; cls: string }[];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-navy-400 transition-colors hover:bg-cream-100 hover:text-navy-600"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl bg-white py-1 shadow-[var(--shadow-elevated)]">
          {items.map((item) => (
            <button
              key={item.action}
              onClick={() => {
                setOpen(false);
                onAction(item.action, listing);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-cream-50 ${item.cls}`}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<ListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Listing | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Read filters from URL
  const status = searchParams.get("status") ?? "";
  const type = searchParams.get("type") ?? "";
  const search = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  /* Fetch listings */
  const fetchListings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (search) params.set("q", search);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/admin/listings?${params}`);
      const json: ListingsResponse = await res.json();
      setData(json);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [status, type, search, page]);

  /* Fetch pending count independently */
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/listings?status=pending_review&page=1");
      const json: ListingsResponse = await res.json();
      setPendingCount(json.total);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  /* Update URL params */
  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") params.delete("page"); // reset to page 1
    router.push(`/admin/listings?${params}`);
  }

  /* PATCH helper */
  async function patchListing(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  /* Actions */
  async function handleAction(action: string, listing: Listing) {
    if (action === "approve") {
      const ok = await patchListing(listing.id, { status: "active" });
      if (ok) {
        setToast(`"${listing.title}" approved`);
        fetchListings();
        fetchPendingCount();
      }
    } else if (action === "reject") {
      setRejectTarget(listing);
    } else if (action === "pause") {
      const ok = await patchListing(listing.id, { status: "paused" });
      if (ok) {
        setToast(`"${listing.title}" paused`);
        fetchListings();
      }
    } else if (action === "view") {
      window.open(`/${listing.islandName.toLowerCase().replace(/\s+/g, "-")}/${listing.id}`, "_blank");
    }
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const ok = await patchListing(rejectTarget.id, { status: "rejected" });
    if (ok) {
      setToast(`"${rejectTarget.title}" rejected`);
      fetchListings();
      fetchPendingCount();
    }
    setRejectTarget(null);
  }

  async function toggleFeatured(listing: Listing) {
    const ok = await patchListing(listing.id, { isFeatured: !listing.isFeatured });
    if (ok) {
      setToast(listing.isFeatured ? "Removed from featured" : "Added to featured");
      fetchListings();
    }
  }

  /* Search debounce */
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function handleSearchChange(value: string) {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilter("q", value), 400);
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectModal
          listing={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <ListPlus size={24} className="text-gold-500" />
        <h1
          className="text-2xl font-bold text-navy-800 md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Listings Management
        </h1>
        {data && (
          <span className="rounded-full bg-gold-100 px-3 py-0.5 text-sm font-semibold text-gold-700">
            {data.total.toLocaleString()}
          </span>
        )}
      </div>

      {/* Pending review alert */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-5 py-3 shadow-sm">
          <AlertTriangle size={18} className="shrink-0 text-amber-500" />
          <p className="text-sm font-medium text-amber-800">
            {pendingCount} listing{pendingCount !== 1 ? "s" : ""} awaiting review
          </p>
          <button
            onClick={() => setFilter("status", "pending_review")}
            className="ml-auto rounded-lg bg-amber-200/60 px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-200"
          >
            Show pending
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status */}
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setFilter("status", e.target.value)}
            className="appearance-none rounded-xl border border-cream-300 bg-white py-2 pl-4 pr-9 text-sm font-medium text-navy-700 shadow-sm outline-none transition-colors focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-navy-400"
          />
        </div>

        {/* Type */}
        <div className="relative">
          <select
            value={type}
            onChange={(e) => setFilter("type", e.target.value)}
            className="appearance-none rounded-xl border border-cream-300 bg-white py-2 pl-4 pr-9 text-sm font-medium text-navy-700 shadow-sm outline-none transition-colors focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-navy-400"
          />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-300"
          />
          <input
            type="text"
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search listings..."
            className="w-full rounded-xl border border-cream-300 bg-white py-2 pl-9 pr-4 text-sm text-navy-700 shadow-sm outline-none transition-colors focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          />
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-gold-500" />
          </div>
        ) : !data || data.listings.length === 0 ? (
          <div className="py-20 text-center">
            <ListPlus size={40} className="mx-auto mb-3 text-navy-200" />
            <p className="text-navy-400">No listings found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50/60">
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-navy-500">Listing</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-navy-500">Operator</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-navy-500">Island</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-navy-500">Price</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-navy-500">Rating</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-navy-500">Status</th>
                  <th className="whitespace-nowrap px-5 py-3 text-center font-semibold text-navy-500">Featured</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-navy-500" />
                </tr>
              </thead>
              <tbody>
                {data.listings.map((listing) => (
                  <tr
                    key={listing.id}
                    className="border-b border-cream-100 transition-colors last:border-0 hover:bg-cream-50"
                  >
                    {/* Title + type badge */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-navy-700">{listing.title}</span>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            TYPE_COLORS[listing.type] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {listing.type}
                        </span>
                      </div>
                    </td>

                    {/* Operator */}
                    <td className="px-5 py-3.5 text-navy-500">
                      {listing.operatorName ?? <span className="text-navy-300">--</span>}
                    </td>

                    {/* Island */}
                    <td className="px-5 py-3.5 text-navy-500">{listing.islandName}</td>

                    {/* Price */}
                    <td className="px-5 py-3.5 font-medium text-navy-700">
                      {listing.priceAmount
                        ? `$${parseFloat(listing.priceAmount).toFixed(2)}`
                        : "--"}
                    </td>

                    {/* Rating */}
                    <td className="px-5 py-3.5">
                      <Stars rating={parseFloat(listing.avgRating)} />
                    </td>

                    {/* Status badge */}
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_COLORS[listing.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {statusLabel(listing.status)}
                      </span>
                    </td>

                    {/* Featured toggle */}
                    <td className="px-5 py-3.5 text-center">
                      <button
                        onClick={() => toggleFeatured(listing)}
                        className="inline-flex rounded-lg p-1 transition-colors hover:bg-cream-100"
                        title={listing.isFeatured ? "Remove from featured" : "Add to featured"}
                      >
                        <Star
                          size={18}
                          className={
                            listing.isFeatured
                              ? "fill-gold-400 text-gold-400"
                              : "text-navy-200 hover:text-gold-300"
                          }
                        />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <ActionsDropdown listing={listing} onAction={handleAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-cream-200 px-5 py-3">
            <p className="text-sm text-navy-400">
              Page {data.page} of {data.totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={data.page <= 1}
                onClick={() => setFilter("page", String(data.page - 1))}
                className="rounded-lg p-1.5 text-navy-500 transition-colors hover:bg-cream-100 disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  // Show first, last, current, and neighbors
                  if (p === 1 || p === data.totalPages) return true;
                  if (Math.abs(p - data.page) <= 1) return true;
                  return false;
                })
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-navy-300">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setFilter("page", String(p))}
                      className={`min-w-[32px] rounded-lg px-2 py-1 text-sm font-medium transition-colors ${
                        p === data.page
                          ? "bg-gold-500 text-white"
                          : "text-navy-500 hover:bg-cream-100"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                disabled={data.page >= data.totalPages}
                onClick={() => setFilter("page", String(data.page + 1))}
                className="rounded-lg p-1.5 text-navy-500 transition-colors hover:bg-cream-100 disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
