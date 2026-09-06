"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type ClaimSummary = {
  listing: { id: string; title: string; address: string | null; islandName: string; url: string; unclaimed: boolean; phoneHint: string | null };
  claim: { id: string; status: string } | null;
  verification?: { state: string; phoneHint?: string | null; available: boolean; reason?: string; channels?: ("sms" | "call")[] };
};

export default function ClaimListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = use(params);
  const router = useRouter();
  const [summary, setSummary] = useState<ClaimSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsSwitch, setNeedsSwitch] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<"sms" | "call">("sms");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/listings/claim?listingId=${encodeURIComponent(listingId)}`, { cache: "no-store" });
      if (response.status === 401) { router.replace(`/auth/signin?next=/operator/claim/${listingId}`); return; }
      if (response.status === 403) { setNeedsSwitch(true); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load this listing.");
      setSummary(data);
    } catch (cause) { setSummary(null); setError(cause instanceof Error ? cause.message : "Could not load this listing."); }
    finally { setLoading(false); }
  }, [listingId, router]);
  useEffect(() => { void load(); }, [load]);

  async function verify(action: "start" | "verify") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/listings/claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, action, ...(action === "verify" ? { code } : { channel }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification could not be completed.");
      if (action === "verify" && data.claim?.status === "approved") { router.push(`/operator/onboarding/${listingId}`); return; }
      if (action === "start") { setCodeSent(true); setCode(""); }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verification could not be completed."); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8" role="status"><Loader2 className="animate-spin" aria-label="Loading business verification" /></div>;
  if (needsSwitch) return <main className="max-w-xl p-8">
    <h1 className="text-2xl font-bold text-navy-700">Claim this business</h1>
    <p className="mt-3 text-navy-500">A business account is needed to verify your authority and manage a listing. Switching is free and keeps your traveler history.</p>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    <button disabled={busy} className="mt-6 rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch("/api/auth/become-operator", { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not switch account.");
        window.location.reload();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch account."); setBusy(false); }
    }}>Switch to a business account</button>
  </main>;

  const listing = summary?.listing;
  const verified = summary?.claim?.status === "approved" && listing?.unclaimed === false;
  return <main className="mx-auto max-w-2xl p-6 md:p-8">
    <Link href="/operator/listings" className="text-sm font-semibold text-gold-700">Back to your listings</Link>
    <h1 className="mt-5 text-3xl font-bold text-navy-700">Verify your business</h1>
    <p className="mt-2 text-navy-500">Claiming verifies control of the business. Bookings remain unavailable until company onboarding is complete and booking services are enabled.</p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {listing && <section className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
      <h2 className="text-xl font-bold text-navy-700">{listing.title}</h2>
      <p className="mt-1 text-sm text-navy-500">{listing.address || listing.islandName}</p>
      <Link href={listing.url} className="mt-2 inline-block text-sm text-gold-700">View directory listing</Link>
      {verified ? <div className="mt-6">
        <p className="font-semibold text-navy-700">Business claim verified</p>
        <Link href={`/operator/onboarding/${listingId}`} className="mt-4 inline-flex rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white">Continue business onboarding</Link>
      </div> : !listing.unclaimed ? <p className="mt-6 text-navy-500">This listing has already been claimed. Your account cannot start another claim.</p> : summary?.verification?.available === true ? <div className="mt-6">
        <h3 className="font-semibold text-navy-700">Verify the published business phone</h3>
        <p className="mt-2 text-sm leading-relaxed text-navy-500">A verification code will be sent to {summary.verification.phoneHint || listing.phoneHint || "the business phone already recorded for this listing"}. You cannot substitute a different number during verification.</p>
        {summary.verification.channels?.includes("call") && <label className="mt-3 block text-sm text-navy-700">Delivery method<select value={channel} onChange={event => setChannel(event.target.value as "sms" | "call")} className="ml-3 rounded-lg border border-cream-300 p-2"><option value="sms">Text message</option><option value="call">Automated phone call</option></select></label>}
        <button disabled={busy} onClick={() => void verify("start")} className="mt-4 rounded-xl border border-gold-700 px-5 py-3 font-semibold text-gold-700 disabled:opacity-50">{busy ? "Please wait…" : codeSent ? "Send a new code" : "Send verification code"}</button>
        {codeSent && <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); void verify("verify"); }}>
          <label className="block text-sm font-semibold text-navy-700" htmlFor="business-code">Verification code</label>
          <input id="business-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,10}" minLength={4} maxLength={10} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="w-full rounded-xl border border-cream-300 p-3" />
          <button disabled={busy || code.length < 4} className="rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Verify and claim</button>
        </form>}
      </div> : <p className="mt-6 rounded-xl bg-cream-50 p-4 text-sm text-navy-600">Automatic verification is currently unavailable for this listing. It will remain information only until a trusted business contact can be verified.</p>}
    </section>}
  </main>;
}
