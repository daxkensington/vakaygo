"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, DollarSign, Loader2, ShieldCheck, XCircle } from "lucide-react";

type PayoutProfile = {
  id: string;
  listingId: string;
  listingTitle: string;
  islandName: string;
  operatorEmail: string;
  operatorName: string | null;
  businessLegalName: string | null;
  businessCountry: string | null;
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
  minimumPayoutUsd: number;
  w8benCertified: boolean;
  w8benBeneficialOwner: string | null;
  w8benCountry: string | null;
  w8benTaxId: string | null;
  w8benSignedName: string | null;
  status: "pending_review" | "verified" | "rejected";
  adminNotes: string | null;
  updatedAt: string;
};

export default function AdminPayoutProfilesPage() {
  const [profiles, setProfiles] = useState<PayoutProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/payout-profiles");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load payout profiles");
      setProfiles(data.profiles || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(profileId: string, decision: "verified" | "rejected" | "revoked") {
    setBusy(profileId);
    setError("");
    try {
      const res = await fetch("/api/admin/payout-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review_profile", profileId, decision, adminNotes: notes[profileId] || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-2">
        <DollarSign className="text-gold-700" size={28} />
        <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
          Caribbean &amp; Direct Payout Profiles
        </h1>
      </div>
      <p className="text-navy-400 text-sm mb-6">
        Review and verify operator PayPal, Wise, and Bank Wire payout rails + IRS Form W-8BEN certifications.
      </p>

      {error && <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-gold-700" /></div>
      ) : profiles.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-navy-400">No direct payout profiles submitted yet.</div>
      ) : (
        <div className="space-y-4">
          {profiles.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] flex flex-col lg:flex-row justify-between gap-4">
              <div className="space-y-2 text-sm text-navy-700">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-navy-800">{p.listingTitle}</span>
                  <span className="text-navy-400">· {p.islandName}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${p.status === "verified" ? "bg-teal-50 text-teal-700" : p.status === "pending_review" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-navy-500">Operator: {p.operatorName || p.operatorEmail} ({p.operatorEmail}) · Legal: {p.businessLegalName || "—"} ({p.businessCountry || "—"})</p>
                <p><strong>Rail:</strong> {p.payoutMethod.toUpperCase()} ({p.payoutCurrency}) · {p.paypalEmail || p.wiseRecipientEmail || `${p.bankName} (${p.bankSwiftBic}) ${p.bankAccountNumberMasked}`}</p>
                <p className="flex items-center gap-1.5 text-teal-800">
                  <ShieldCheck size={15} />
                  <span><strong>W-8BEN:</strong> {p.w8benBeneficialOwner} ({p.w8benCountry}) · Signed by {p.w8benSignedName}</span>
                </p>
              </div>
              <div className="w-full lg:w-72 shrink-0 space-y-2">
                <input
                  value={notes[p.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                  placeholder="Admin note (optional)"
                  className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  {p.status !== "verified" && (
                    <button onClick={() => void review(p.id, "verified")} disabled={busy === p.id} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5">
                      <BadgeCheck size={15} /> Verify
                    </button>
                  )}
                  <button onClick={() => void review(p.id, p.status === "verified" ? "revoked" : "rejected")} disabled={busy === p.id} className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 py-2 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5">
                    <XCircle size={15} /> {p.status === "verified" ? "Revoke" : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
