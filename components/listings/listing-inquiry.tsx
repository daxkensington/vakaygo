"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Send } from "lucide-react";

export function ListingInquiry({ listingId, listingTitle }: { listingId: string; listingTitle: string }) {
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  const today = useRef(new Date().toISOString().slice(0, 10));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/listings/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, email, startDate: startDate || null, endDate: endDate || null, partySize, message, website }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSaved(data.code === "INQUIRY_SAVED");
        setError(data.error || "Could not send your inquiry. Please try again.");
        return;
      }
      if (data.success !== true || typeof data.inquiryId !== "string") {
        setError("Could not confirm your inquiry. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not send your inquiry. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section id="listing-inquiry" aria-label={`Ask about ${listingTitle}`} className="rounded-2xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)]">
      <p className="text-xs font-bold uppercase tracking-wider text-gold-700">No account needed</p>
      <h2 className="mt-2 text-xl font-bold text-navy-800">Ask about availability</h2>
      {submitted ? (
        <div role="status" className="mt-5 rounded-xl bg-teal-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-teal-800"><Check size={19} /> Inquiry received</div>
          <p className="mt-3 text-sm leading-relaxed text-teal-800">Our team will try to reach {listingTitle} and reply by email. This is not a booking, nothing is reserved, and no payment was taken. A business reply and your requested dates cannot be guaranteed.</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-navy-500">Ask VakayGo to check with {listingTitle}. We will try to contact the business for you; a reply is not guaranteed.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label htmlFor={`${id}-email`} className="text-sm font-semibold text-navy-700">Your email</label>
              <input id={`${id}-email`} type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder="you@example.com" className="mt-1.5 w-full rounded-xl border border-cream-300 px-3 py-2.5 text-sm text-navy-700 outline-none focus:border-gold-500" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <label htmlFor={`${id}-start`} className="text-sm font-semibold text-navy-700">Start date <span className="font-normal text-navy-400">(optional)</span></label>
                <input id={`${id}-start`} type="date" min={today.current} value={startDate} onChange={event => { setStartDate(event.target.value); if (endDate && event.target.value > endDate) setEndDate(""); }} disabled={busy} className="mt-1.5 w-full rounded-xl border border-cream-300 px-3 py-2.5 text-sm text-navy-700 outline-none focus:border-gold-500" />
              </div>
              <div>
                <label htmlFor={`${id}-end`} className="text-sm font-semibold text-navy-700">End date <span className="font-normal text-navy-400">(optional)</span></label>
                <input id={`${id}-end`} type="date" min={startDate || today.current} value={endDate} onChange={event => setEndDate(event.target.value)} disabled={busy} className="mt-1.5 w-full rounded-xl border border-cream-300 px-3 py-2.5 text-sm text-navy-700 outline-none focus:border-gold-500" />
              </div>
            </div>
            <div>
              <label htmlFor={`${id}-party`} className="text-sm font-semibold text-navy-700">Party size</label>
              <select id={`${id}-party`} value={partySize} onChange={event => setPartySize(Number(event.target.value))} disabled={busy} className="mt-1.5 w-full rounded-xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-navy-700 outline-none focus:border-gold-500">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map(size => <option key={size} value={size}>{size} {size === 1 ? "person" : "people"}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-message`} className="text-sm font-semibold text-navy-700">Anything we should ask? <span className="font-normal text-navy-400">(optional)</span></label>
              <textarea id={`${id}-message`} rows={3} maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} disabled={busy} placeholder="Timing, pickup, accessibility, or other questions" className="mt-1.5 w-full resize-none rounded-xl border border-cream-300 px-3 py-2.5 text-sm text-navy-700 outline-none focus:border-gold-500" />
            </div>
            <div className="hidden" aria-hidden="true">
              <label htmlFor={`${id}-website`}>Leave this field empty</label>
              <input id={`${id}-website`} type="text" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
            </div>
            {error && <p role="alert" className={`rounded-xl p-3 text-sm ${saved ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>{error}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold-700 px-4 py-3 font-semibold text-white hover:bg-gold-800 disabled:opacity-60">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {busy ? "Sending inquiry…" : saved ? "Retry team notification" : "Send availability inquiry"}
            </button>
            <p className="text-xs leading-relaxed text-navy-500">This is an inquiry, not a booking or payment. We use your details to respond to and manage this request, not to add you to marketing. <Link href="/privacy#listing-inquiries" className="underline">Privacy details</Link>.</p>
          </form>
        </>
      )}
    </section>
  );
}
