"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Loader2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { INTEREST_NOTICE_VERSION } from "@/lib/listing-interest";

export function ListingInterest({ listingId, listingPath, operatorId }: { listingId: string; listingPath: string; operatorId: string }) {
  const { user, loading } = useAuth();
  const [interested, setInterested] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setInterested(false); setReady(false); setError("");
    if (!user) return;
    const controller = new AbortController();
    fetch("/api/listings/interest?listingId=" + listingId, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load your interest."); return data; })
      .then(data => { if (!controller.signal.aborted) { setInterested(data.interested === true); setReady(true); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message || "Could not load your interest."); });
    return () => controller.abort();
  }, [user?.id, listingId, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/listings/interest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, interested: !interested, noticeVersion: INTEREST_NOTICE_VERSION }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save your interest.");
      setInterested(data.interested === true);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save your interest."); }
    finally { setBusy(false); }
  }
  const owner = user?.id === operatorId || user?.role === "admin";
  return <section id="listing-interest" className="rounded-2xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)]">
    <p className="text-xs font-bold uppercase tracking-wider text-gold-700">Discover now</p>
    <h2 className="mt-2 text-xl font-bold text-navy-800">Interested in this business?</h2>
    <p className="mt-3 text-sm leading-relaxed text-navy-500">Let VakayGo know. Your interest helps us decide which businesses to invite to claim or complete their listing.</p>
    <p className="mt-3 rounded-xl bg-cream-50 p-3 text-sm text-navy-600">Bookings are currently unavailable for this listing. Recording interest does not reserve anything, request availability, or involve a payment.</p>
    <p className="mt-3 text-xs leading-relaxed text-navy-500">We count your interest privately and may share the total with the business. We do not share your name or contact details through this feature. You can remove your interest here at any time. <Link className="underline" href="/privacy#listing-interest">Privacy details</Link>.</p>
    {loading ? <p className="mt-5 text-sm text-navy-500">Loading…</p> : !user ? <Link href={"/auth/signin?next=" + encodeURIComponent(listingPath)} className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-gold-700 px-4 py-3 font-semibold text-white"><Heart size={18} />Sign in to show interest</Link> : owner ? <p className="mt-5 text-sm text-navy-500">This feature records traveler interest. Manage your business through the <Link href={user.role === "admin" ? "/admin/outreach" : "/operator"} className="underline">dashboard</Link>.</p> : !user.emailVerified && !interested ? <p className="mt-5 text-sm text-navy-600"><Link href="/auth/verify-email" className="font-semibold underline">Verify your email</Link> before recording interest.</p> : <>
      <button onClick={save} disabled={busy || !ready} aria-pressed={interested} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : interested ? <Check size={18} /> : <Heart size={18} />}{interested ? "Remove my interest" : "I’m interested"}</button>
      {interested && <p role="status" className="mt-3 text-sm text-teal-700">Your interest is recorded. No booking has been made and no reply is promised.</p>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}{!ready && <button className="ml-2 underline" onClick={() => setRetry(value => value + 1)}>Retry</button>}</p>}
  </section>;
}
