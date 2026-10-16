"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OUTREACH_STATUSES, type OutreachStatus } from "@/lib/listing-interest";
type Item = { id: string; title: string; slug: string; listingType?: string; avgRating?: string | null; reviewCount?: number | null; islandSlug: string; islandName: string; website: string | null; email?: string | null; phone: string | null; whatsapp?: string | null; instagram?: string | null; facebook?: string | null; contactSource: string | null; status: OutreachStatus; notes: string; updatedAt: string; contactedAt?: string | null; lastInterest: string | null; interestedCustomers: number; claimVerified: boolean; draft: string | null };
const labels: Record<OutreachStatus, string> = { new: "Ready for outreach", reviewing: "In review", contacted: "Contacted", do_not_contact: "Do not contact" };
const TYPES = ["all", "vip", "excursion", "tour", "stay", "transfer", "transport", "spa", "dining", "event", "guide"] as const;
function OutreachCard({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [status, setStatus] = useState(item.status);
  const [notes, setNotes] = useState(item.notes);
  const [emailInput, setEmailInput] = useState(item.email || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/outreach", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: item.id, status, notes, expectedUpdatedAt: item.updatedAt }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save.");
      onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(false); }
  }
  async function enrichEmail() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: item.id, action: "enrich" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not enrich email.");
      setEmailInput(data.email || "");
      setMessage(`Found business email: ${data.email}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not enrich email."); }
    finally { setBusy(false); }
  }
  async function sendInviteEmail() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: item.id, action: "send_email", email: emailInput.trim() || undefined }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not send invitation.");
      setMessage(`Claim invitation emailed to ${data.email}.`);
      onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send invitation."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(item.draft || ""); setMessage("Draft copied. Review the recipient, consent basis, sender address and wording before sending."); }
    catch { setMessage("Copy is unavailable. Select and copy the draft text below."); }
  }
  return <article className="rounded-2xl border border-cream-300 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap justify-between gap-3"><div><Link href={"/" + item.islandSlug + "/" + item.slug} className="text-xl font-bold text-navy-800 hover:underline">{item.title}</Link><p className="mt-1 text-sm text-navy-500">{item.islandName}{item.listingType ? ` · ${item.listingType.toUpperCase()}` : ""}{item.avgRating ? ` · ★ ${Number(item.avgRating).toFixed(1)}` : ""} · {item.claimVerified ? "Ownership verified — help complete the listing" : "Ownership not verified"}</p></div><p className="rounded-xl bg-gold-50 px-4 py-2 text-sm font-semibold text-gold-800">{item.interestedCustomers} interested {item.interestedCustomers === 1 ? "traveler" : "travelers"}</p></div>
    <p className="mt-3 text-xs text-navy-500">{item.lastInterest ? "Latest active interest: " + new Date(item.lastInterest).toLocaleString() : "Ready for partner claim outreach"} · One count per verified email account; withdrawn interest is excluded.{item.contactedAt ? " · Last emailed: " + new Date(item.contactedAt).toLocaleString() : ""}</p>
    <div className="mt-4 flex flex-wrap gap-4 text-sm">{item.website && <a href={item.website} target="_blank" rel="noopener noreferrer" className="text-gold-700 underline">Review business website</a>}{item.email && <span className="text-navy-600">Email on file: {item.email}</span>}{item.phone && <span className="text-navy-600">Phone on file: {item.phone}{item.contactSource ? ` (${item.contactSource})` : ""}</span>}{item.whatsapp && <span className="text-navy-600">WhatsApp: {item.whatsapp}</span>}{item.instagram && <a href={item.instagram} target="_blank" rel="noopener noreferrer" className="text-gold-700 underline">Instagram</a>}{item.facebook && <a href={item.facebook} target="_blank" rel="noopener noreferrer" className="text-gold-700 underline">Facebook</a>}{!item.website && !item.phone && !item.email && !item.whatsapp && !item.instagram && !item.facebook && <span className="text-navy-500">No contact route on file. Research the official business contact before outreach.</span>}</div>
    {item.status !== "do_not_contact" && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-cream-50 p-3 border border-cream-200">
      <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="Business email (or auto-discover from website)" className="min-w-[16rem] flex-1 rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-navy-700" />
      {item.website && !emailInput && <button type="button" disabled={busy} onClick={enrichEmail} className="rounded-lg border border-cream-300 bg-white px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-cream-100 disabled:opacity-50">Find email from website</button>}
      <button type="button" disabled={busy || (!emailInput.trim() && !item.website)} onClick={sendInviteEmail} className="rounded-lg bg-gold-700 px-4 py-2 text-xs font-semibold text-white hover:bg-gold-800 disabled:opacity-50">Send claim invitation email</button>
    </div>}
    {item.draft && <details className="mt-5 rounded-xl border border-cream-200 p-4"><summary className="cursor-pointer font-semibold text-navy-700">Review claim invitation draft</summary><p className="mt-3 text-sm text-navy-500">Customer interest is not the business’s consent to receive email. Verify the business contact and applicable consent basis, add the sender’s identity and mailing address, and honor opt-outs.</p><textarea readOnly aria-label={"Outreach draft for " + item.title} value={item.draft} rows={14} className="mt-4 w-full rounded-lg border border-cream-300 p-3 text-sm text-navy-600" /><button onClick={copy} className="mt-2 rounded-lg bg-cream-100 px-4 py-2 text-sm font-semibold text-navy-700">Copy draft for review</button></details>}
    {item.status === "do_not_contact" && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">Outreach suppressed. New interest will not reopen this business.</p>}
    <div className="mt-5 grid gap-4 md:grid-cols-[12rem_1fr]"><label className="text-sm font-semibold text-navy-700">Status<select value={status} disabled={item.status === "do_not_contact"} onChange={e => setStatus(e.target.value as OutreachStatus)} className="mt-2 w-full rounded-lg border border-cream-300 p-3 font-normal">{OUTREACH_STATUSES.map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label><label className="text-sm font-semibold text-navy-700">Review and contact notes<textarea maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Official contact source, consent basis, contact date/channel, outcome, or opt-out reason. Do not paste customer details." className="mt-2 w-full rounded-lg border border-cream-300 p-3 font-normal" /></label></div>
    <button disabled={busy} onClick={save} className="mt-4 rounded-xl bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save review"}</button>{message && <p role="status" className="mt-3 text-sm text-navy-600">{message}</p>}
  </article>;
}
export default function OutreachPage() {
  const [status, setStatus] = useState("new");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const key = status + ":" + typeFilter + ":" + search + ":" + page + ":" + revision;
  const [result, setResult] = useState<{ key: string; items: Item[]; hasMore: boolean; error: string }>({ key: "", items: [], hasMore: false, error: "" });
  const busy = result.key !== key;
  const { items, hasMore, error } = result;
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ status, type: typeFilter, q: search, page: String(page) });
    fetch("/api/admin/outreach?" + qs.toString(), { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load outreach."); return data; })
      .then(data => { if (!controller.signal.aborted) setResult({ key, items: data.items, hasMore: data.hasMore, error: "" }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, items: [], hasMore: false, error: error.message || "Could not load outreach." }); });
    return () => controller.abort();
  }, [status, typeFilter, search, page, key]);
  return <div className="mx-auto max-w-5xl"><h1 className="text-3xl font-bold text-navy-800">Business outreach</h1><p className="mt-3 max-w-3xl text-navy-500">Prioritize businesses by recorded traveler interest, category, and verified contact info. Review their contact channels, send a 1-click claim invitation, and track partner onboarding.</p>
    <div className="my-6 flex flex-wrap items-center gap-3"><label className="sr-only" htmlFor="outreach-status">Filter outreach status</label><select id="outreach-status" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className="rounded-xl border border-cream-300 bg-white px-4 py-3">{OUTREACH_STATUSES.map(s => <option key={s} value={s}>{labels[s]}</option>)}<option value="all">All records</option></select><label className="sr-only" htmlFor="outreach-type">Filter category</label><select id="outreach-type" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }} className="rounded-xl border border-cream-300 bg-white px-4 py-3">{TYPES.map(t => <option key={t} value={t}>{t === "all" ? "All categories" : t.toUpperCase()}</option>)}</select><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search business or email…" className="rounded-xl border border-cream-300 bg-white px-4 py-3 text-sm" /><button onClick={reload} className="rounded-xl border border-cream-300 px-4 py-3 text-sm font-semibold">Refresh</button><Link href="/admin/claims" className="text-sm font-semibold text-gold-700 underline">View ownership claims</Link></div>
    {busy ? <p role="status">Loading outreach…</p> : error ? <p role="alert" className="text-red-700">{error}</p> : items.length === 0 ? <div className="rounded-2xl bg-white p-10 text-center text-navy-500">No businesses match the current filters.</div> : <div className="space-y-5">{items.map(item => <OutreachCard key={item.id + item.updatedAt} item={item} onSaved={reload} />)}</div>}
    <div className="mt-6 flex items-center gap-4"><button disabled={busy || page === 0} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-cream-300 px-4 py-2 disabled:opacity-40">Previous</button><span className="text-sm text-navy-500">Page {page + 1}</span><button disabled={busy || !hasMore} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-cream-300 px-4 py-2 disabled:opacity-40">Next</button></div>
  </div>;
}
