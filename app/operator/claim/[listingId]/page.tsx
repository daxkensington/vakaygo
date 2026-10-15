"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type ClaimSummary = {
  listing: { id: string; title: string; address: string | null; islandName: string; url: string; unclaimed: boolean; phoneHint: string | null; emailHint?: string | null; instantEligible?: boolean; matchedDomain?: string | null };
  claim: { id: string; status: string } | null;
  claimVerified?: boolean;
  verification?: { state: string; phoneHint?: string | null; emailHint?: string | null; instantEligible?: boolean; available: boolean; canStart?: boolean; busyUntil?: string | null; reason?: string; channels?: ("sms" | "call" | "email")[] };
};

export default function ClaimListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = use(params);
  const router = useRouter();
  const [summary, setSummary] = useState<ClaimSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<"email" | "role" | null>(null);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<"sms" | "call" | "email">("sms");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const request = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch(`/api/listings/claim?listingId=${encodeURIComponent(listingId)}`, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted || request !== requestSequence.current) return;
      if (response.status === 401) { router.replace(`/auth/signin?next=/operator/claim/${listingId}`); return; }
      if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        if (controller.signal.aborted || request !== requestSequence.current) return;
        setSummary(null); setBlocked(data.code === "email_unverified" ? "email" : "role");
        return;
      }
      const data = await response.json();
      if (controller.signal.aborted || request !== requestSequence.current) return;
      if (!response.ok) throw new Error(data.error || "Could not load this listing.");
      if (data.listing?.id !== listingId) throw new Error("Could not load this listing.");
      setSummary(data);
      const chans: string[] = Array.isArray(data.verification?.channels) ? data.verification.channels : [];
      if (chans.includes("email") && !chans.includes("sms")) setChannel("email");
      setBlocked(null); setError("");
      setCodeSent(data.verification?.state === "pending");
    } catch (cause) { if (request === requestSequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load this listing."); }
    finally { if (!controller.signal.aborted && request === requestSequence.current) { setLoading(false); setRefreshing(false); } }
  }, [listingId, router]);
  useEffect(() => {
    setLoading(true); setSummary(null); setCode(""); setCodeSent(false); void load();
    return () => { requestController.current?.abort(); };
  }, [load]);

  async function verify(action: "start" | "verify" | "instant_claim" | "request_review") {
    if (busy || refreshing) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/listings/claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, action, ...(action === "verify" ? { code } : action === "start" ? { channel } : {}) }),
      });
      const data = await response.json();
      if (response.status === 401) { router.replace(`/auth/signin?next=/operator/claim/${listingId}`); return; }
      if (response.status === 403 && ["email_unverified", "role_required"].includes(data.code)) { setSummary(null); setBlocked(data.code === "email_unverified" ? "email" : "role"); return; }
      if (!response.ok) throw new Error(data.error || "Verification could not be completed.");
      if ((action === "verify" || action === "instant_claim") && data.claim?.status === "approved") { router.push(`/operator/onboarding/${listingId}`); return; }
      if (action === "start") { setCodeSent(true); setCode(""); }
      if (action === "request_review") { setReviewSubmitted(true); }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verification could not be completed."); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8" role="status"><Loader2 className="animate-spin" aria-label="Loading business verification" /></div>;
  if (blocked === "email") return <main className="max-w-xl p-8">
    <h1 className="text-2xl font-bold text-navy-700">Confirm your email</h1>
    <p className="mt-3 text-navy-500">Verify the inbox on this account before claiming the business. The confirmation link brings you back to this listing. Claiming does not enable bookings.</p>
    <Link href={`/auth/verify-email?claim=${listingId}`} className="mt-6 inline-flex rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white">Continue email verification</Link>
  </main>;
  if (blocked === "role") return <main className="max-w-xl p-8">
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
  const supportHref = listing && /^\/[\w-]+\/[\w-]+$/.test(listing.url) ? `/contact?listing=${encodeURIComponent(listing.url)}` : "/contact";
  const verified = summary?.claimVerified === true;
  const pending = summary?.verification?.state === "pending" || codeSent;
  const sending = summary?.verification?.state === "sending";
  const anotherAttempt = !!summary?.verification?.busyUntil && !pending && !sending;
  return <main className="mx-auto max-w-2xl p-6 md:p-8">
    <Link href="/operator/listings" className="text-sm font-semibold text-gold-700">Back to your listings</Link>
    <h1 className="mt-5 text-3xl font-bold text-navy-700">Verify your business</h1>
    <p className="mt-2 text-navy-500">Claiming verifies control of the business. Bookings remain unavailable until company onboarding is complete and booking services are enabled.</p>
    {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700"><p>{error}</p>{listing && summary?.verification?.available === true && <Link href={supportHref} className="mt-3 inline-flex font-semibold underline">Contact VakayGo about this listing</Link>}</div>}
    <button type="button" disabled={busy || refreshing} onClick={() => void load()} className="mt-4 rounded-xl border border-cream-300 px-5 py-2.5 font-semibold text-navy-700 disabled:opacity-50">{refreshing ? "Refreshing status…" : summary ? "Refresh claim status" : "Try loading again"}</button>
    {listing && <section className="mt-6 rounded-2xl border border-cream-200 bg-white p-6">
      <h2 className="text-xl font-bold text-navy-700">{listing.title}</h2>
      <p className="mt-1 text-sm text-navy-500">{listing.address || listing.islandName}</p>
      <Link href={listing.url} className="mt-2 inline-block text-sm text-gold-700">View directory listing</Link>
      {verified ? <div className="mt-6">
        <p className="font-semibold text-navy-700">Business claim verified</p>
        <Link href={`/operator/onboarding/${listingId}`} className="mt-4 inline-flex rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white">Continue business onboarding</Link>
      </div> : !listing.unclaimed ? <p className="mt-6 text-navy-500">This listing has already been claimed. Your account cannot start another claim.</p> : <>
      {summary?.verification?.instantEligible && (
        <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50/70 p-4">
          <h3 className="font-semibold text-navy-700">Instant Business Domain Verification</h3>
          <p className="mt-1 text-sm text-navy-600">Your verified account email matches {listing.matchedDomain || "this business"}. You can claim this listing immediately in one click.</p>
          <button type="button" disabled={busy || refreshing} onClick={() => void verify("instant_claim")} className="mt-3 rounded-xl bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-800 disabled:opacity-50">{busy ? "Claiming…" : "Claim Business Instantly"}</button>
        </div>
      )}
      {summary?.verification?.available === true ? <div className="mt-6">
        <h3 className="font-semibold text-navy-700">{channel === "email" ? "Verify the published business email" : "Verify the published business phone"}</h3>
        <p className="mt-2 text-sm leading-relaxed text-navy-500">A verification code will be sent to {channel === "email" ? (summary.verification.emailHint || listing.emailHint || "the business email recorded for this listing") : (summary.verification.phoneHint || listing.phoneHint || "the business phone already recorded for this listing")}. You cannot substitute a different {channel === "email" ? "email" : "number"} during verification.</p>
        {(summary.verification.channels?.includes("call") || summary.verification.channels?.includes("email")) && <label className="mt-3 block text-sm text-navy-700">Delivery method<select value={channel} onChange={event => setChannel(event.target.value as "sms" | "call" | "email")} className="ml-3 rounded-lg border border-cream-300 p-2">{summary.verification.channels?.includes("sms") && <option value="sms">Text message</option>}{summary.verification.channels?.includes("call") && <option value="call">Automated phone call</option>}{summary.verification.channels?.includes("email") && <option value="email">Business email ({summary.verification.emailHint || "on file"})</option>}</select></label>}
        {(pending || sending || anotherAttempt) && <p role="status" className="mt-4 text-sm text-navy-600">{pending ? `A code has already been sent to the published business ${channel === "email" ? "email" : "phone"}. Enter that code below. If it expires, refresh the claim status before requesting another.` : sending ? "A verification request is being sent. Refresh the claim status to continue." : "A verification for this business phone is already in progress. Wait for it to expire, then refresh the claim status. No new code will be sent while it is active."}</p>}
        <button type="button" disabled={busy || refreshing || pending || sending || anotherAttempt || summary.verification.canStart === false} onClick={() => void verify("start")} className="mt-4 rounded-xl border border-gold-700 px-5 py-3 font-semibold text-gold-700 disabled:opacity-50">{busy ? "Please wait…" : "Send verification code"}</button>
        {pending && <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); void verify("verify"); }}>
          <label className="block text-sm font-semibold text-navy-700" htmlFor="business-code">Verification code</label>
          <input id="business-code" disabled={busy} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,10}" minLength={4} maxLength={10} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="w-full rounded-xl border border-cream-300 p-3" />
          <button disabled={busy || refreshing || code.length < 4} className="rounded-xl bg-gold-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Verify and claim</button>
        </form>}
      </div> : <div className="mt-6 rounded-xl bg-cream-50 p-4 text-sm text-navy-600">
        <p>{summary?.verification?.reason === "trusted_contact_changed"
          ? "The trusted business contact has changed. The previous code cannot verify this listing. Contact VakayGo for review; do not substitute a different number."
          : summary?.verification?.reason === "trusted_contact_unavailable"
          ? "This listing does not have a business phone on file that we can verify automatically. It stays information only until support reviews a trusted contact. Do not substitute a different phone number."
          : summary?.verification?.reason === "verification_unavailable"
            ? "Text and voice verification is temporarily unavailable. Contact VakayGo with this listing and we will review it with you."
            : "Automatic verification is currently unavailable for this listing. It will remain information only until a trusted business contact can be verified."}</p>
        <p className="mt-3">Include this listing: <span className="font-semibold">{listing.url}</span></p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {summary?.claim?.status === "pending" || reviewSubmitted ? (
            <span className="rounded-xl bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-700">Claim request submitted — our team is reviewing your ownership</span>
          ) : (
            <button type="button" disabled={busy || refreshing} onClick={() => void verify("request_review")} className="rounded-xl bg-gold-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gold-800 disabled:opacity-50">{busy ? "Submitting…" : "Submit Claim for Team Review"}</button>
          )}
          <Link href={supportHref} className="inline-flex font-semibold text-gold-700 underline">Contact VakayGo</Link>
        </div>
      </div>}</>}
    </section>}
  </main>;
}
