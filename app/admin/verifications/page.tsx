"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  FileText,
  Camera,
  Eye,
  X,
} from "lucide-react";

type Verification = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  documentUrl: string;
  selfieUrl: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  submittedAt: string;
};

const statusConfig: Record<string, { bg: string; color: string; icon: typeof Clock }> = {
  pending: { bg: "bg-amber-100", color: "text-amber-700", icon: Clock },
  approved: { bg: "bg-green-100", color: "text-green-700", icon: CheckCircle },
  rejected: { bg: "bg-red-100", color: "text-red-700", icon: XCircle },
};

export default function VerificationsPage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Review modal
  const [reviewItem, setReviewItem] = useState<Verification | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);

  // Image preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/verifications")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setVerifications(data.verifications || data);
      })
      .catch(() => setError("Failed to load verifications"))
      .finally(() => setLoading(false));
  }, []);

  async function handleApprove(id: string) {
    setError("");
    setSuccess("");
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/verifications/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (res.ok) {
        setVerifications((prev) =>
          prev.map((v) => (v.id === id ? { ...v, status: "approved" as const } : v))
        );
        setSuccess("Verification approved.");
        setReviewItem(null);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to approve");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject(id: string) {
    if (!rejectionReason.trim()) {
      setError("Please provide a rejection reason.");
      return;
    }
    setError("");
    setSuccess("");
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/verifications/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", rejectionReason }),
      });
      if (res.ok) {
        setVerifications((prev) =>
          prev.map((v) =>
            v.id === id ? { ...v, status: "rejected" as const, rejectionReason } : v
          )
        );
        setSuccess("Verification rejected.");
        setReviewItem(null);
        setRejectionReason("");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to reject");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setProcessing(false);
    }
  }

  const pending = verifications.filter((v) => v.status === "pending");
  const reviewed = verifications.filter((v) => v.status !== "pending");

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-gold-500" />
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
          ID Verifications
        </h1>
        <p className="text-navy-400 mt-1">
          Review identity documents and approve or reject users.
          {pending.length > 0 && (
            <span className="ml-2 text-amber-600 font-semibold">
              {pending.length} pending review
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

      {/* Pending Verifications */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
          <Clock size={18} className="text-amber-500" />
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)] text-center">
            <ShieldCheck className="w-12 h-12 text-green-300 mx-auto mb-4" />
            <p className="text-navy-500 font-medium">All caught up! No pending verifications.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pending.map((v) => (
              <div key={v.id} className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-bold text-sm">
                    {(v.userName || v.userEmail).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-700 truncate">
                      {v.userName || "Unknown"}
                    </p>
                    <p className="text-xs text-navy-400 truncate">{v.userEmail}</p>
                  </div>
                  <span className="text-xs text-navy-400">
                    {new Date(v.submittedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                {/* Document & Selfie thumbnails */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    onClick={() => setPreviewUrl(v.documentUrl)}
                    className="relative group rounded-xl overflow-hidden bg-cream-100 aspect-[4/3] flex items-center justify-center"
                  >
                    <img
                      src={v.documentUrl}
                      alt="ID Document"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="absolute bottom-1 left-1 text-[10px] font-medium bg-black/50 text-white px-1.5 py-0.5 rounded">
                      <FileText size={8} className="inline mr-0.5" />
                      ID
                    </span>
                  </button>
                  <button
                    onClick={() => setPreviewUrl(v.selfieUrl)}
                    className="relative group rounded-xl overflow-hidden bg-cream-100 aspect-[4/3] flex items-center justify-center"
                  >
                    <img
                      src={v.selfieUrl}
                      alt="Selfie"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="absolute bottom-1 left-1 text-[10px] font-medium bg-black/50 text-white px-1.5 py-0.5 rounded">
                      <Camera size={8} className="inline mr-0.5" />
                      Selfie
                    </span>
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(v.id)}
                    disabled={processing}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    <CheckCircle size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setReviewItem(v);
                      setRejectionReason("");
                    }}
                    disabled={processing}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reviewed Verifications */}
      {reviewed.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-navy-300" />
            Reviewed ({reviewed.length})
          </h2>
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-cream-200">
                    <th className="px-6 py-4 font-semibold text-navy-500">User</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Status</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Submitted</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewed.map((v) => {
                    const cfg = statusConfig[v.status];
                    const StatusIcon = cfg.icon;
                    return (
                      <tr
                        key={v.id}
                        className="border-b border-cream-100 last:border-0 hover:bg-cream-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-navy-700">{v.userName || v.userEmail}</p>
                          <p className="text-xs text-navy-400">{v.userEmail}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon size={12} />
                            {v.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-navy-400">
                          {new Date(v.submittedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-6 py-4 text-navy-500">
                          {v.rejectionReason || <span className="text-navy-300">--</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {reviewItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setReviewItem(null)} />
          <div className="relative bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)] w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-navy-700">Reject Verification</h3>
              <button
                onClick={() => setReviewItem(null)}
                className="text-navy-400 hover:text-navy-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-navy-500 mb-4">
              Rejecting verification for <span className="font-semibold text-navy-700">{reviewItem.userName || reviewItem.userEmail}</span>.
              Please provide a reason.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Document is blurry, selfie does not match ID..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setReviewItem(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-navy-500 hover:bg-cream-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(reviewItem.id)}
                disabled={processing || !rejectionReason.trim()}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setPreviewUrl(null)} />
          <div className="relative max-w-3xl w-full">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X size={24} />
            </button>
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
