"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, Phone, Globe, XCircle, CheckCircle2 } from "lucide-react";

type Claim = {
  id: string;
  status: "pending" | "approved" | "rejected";
  contactName: string;
  contactPhone: string;
  roleAtBusiness: string | null;
  notes: string | null;
  adminNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  listingType: string;
  listingPhone: string | null;
  listingWebsite: string | null;
  islandName: string;
  islandSlug: string;
  claimantEmail: string;
  claimantName: string | null;
  claimantBusinessName: string | null;
};

const TABS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminClaimsPage() {
  const [tab, setTab] = useState("pending");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/claims?status=${tab}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setClaims(data.claims);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    if (action === "approve" && !window.confirm("Approve this claim? Ownership of the listing transfers immediately.")) return;
    if (action === "reject" && !window.confirm("Reject this claim?")) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/admin/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, adminNotes: notes[id] || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-2">
        <BadgeCheck className="text-gold-700" size={28} />
        <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
          Listing Claims
        </h1>
      </div>
      <p className="text-navy-400 text-sm mb-6">
        Verify by calling the phone number <strong>on the listing</strong>, never the number the claimant typed.
        Approving hands the listing, its bookings and its payouts to the claimant.
      </p>

      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-navy-700 text-white" : "bg-white text-navy-500 hover:bg-cream-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-gold-700" />
        </div>
      ) : claims.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-navy-400">No {tab} claims.</div>
      ) : (
        <div className="space-y-4">
          {claims.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <a
                    href={`/${c.islandSlug}/${c.listingSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-navy-700 hover:text-gold-600 text-lg"
                  >
                    {c.listingTitle}
                  </a>
                  <p className="text-sm text-navy-400">
                    {c.islandName} · <span className="capitalize">{c.listingType}</span> ·{" "}
                    {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
                    <div className="bg-cream-50 rounded-xl p-4">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-navy-400 mb-2">
                        On the listing (call this)
                      </p>
                      <p className="flex items-center gap-2 text-navy-700">
                        <Phone size={14} /> {c.listingPhone || <em className="text-navy-300">no phone on file</em>}
                      </p>
                      {c.listingWebsite && (
                        <p className="flex items-center gap-2 text-navy-700 mt-1 truncate">
                          <Globe size={14} />
                          <a href={c.listingWebsite} target="_blank" rel="noreferrer" className="text-gold-700 truncate">
                            {c.listingWebsite}
                          </a>
                        </p>
                      )}
                    </div>
                    <div className="bg-teal-50 rounded-xl p-4">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-navy-400 mb-2">Claimant</p>
                      <p className="text-navy-700 font-medium">
                        {c.contactName}
                        {c.roleAtBusiness && <span className="text-navy-400 font-normal"> · {c.roleAtBusiness}</span>}
                      </p>
                      <p className="text-navy-600">{c.contactPhone}</p>
                      <p className="text-navy-600 truncate">{c.claimantEmail}</p>
                      {c.claimantBusinessName && <p className="text-navy-400">{c.claimantBusinessName}</p>}
                    </div>
                  </div>

                  {c.notes && (
                    <p className="text-sm text-navy-500 mt-3 whitespace-pre-wrap">
                      <span className="font-semibold text-navy-600">Notes:</span> {c.notes}
                    </p>
                  )}
                  {c.adminNotes && c.status !== "pending" && (
                    <p className="text-sm text-navy-400 mt-2">
                      <span className="font-semibold">Decision note:</span> {c.adminNotes}
                    </p>
                  )}
                </div>

                {c.status === "pending" ? (
                  <div className="w-full lg:w-72 shrink-0 space-y-2">
                    <textarea
                      value={notes[c.id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                      placeholder="Note to the claimant (optional)"
                      rows={3}
                      className="w-full border border-cream-300 rounded-xl p-3 text-sm outline-none focus:border-gold-500"
                    />
                    <button
                      onClick={() => review(c.id, "approve")}
                      disabled={busy === c.id}
                      className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      {busy === c.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Approve &amp; transfer
                    </button>
                    <button
                      onClick={() => review(c.id, "reject")}
                      disabled={busy === c.id}
                      className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                ) : (
                  <span
                    className={`self-start px-3 py-1 rounded-full text-xs font-semibold ${
                      c.status === "approved" ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {c.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
