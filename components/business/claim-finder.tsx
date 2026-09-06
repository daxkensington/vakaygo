"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, MapPin, ArrowRight, Loader2 } from "lucide-react";
type Result = { id: string; title: string; slug: string; islandSlug: string; islandName: string; address: string | null; claimVerified: boolean };
export function ClaimFinder() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSearched(false); setResults([]);
    try {
      const response = await fetch("/api/listings/claim-search?q=" + encodeURIComponent(query.trim()));
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Search is unavailable. Please try again.");
      setResults(data.listings); setSearched(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Search is unavailable. Please try again."); }
    finally { setBusy(false); }
  }
  return <div id="find-listing" className="scroll-mt-24 rounded-3xl border border-cream-200 bg-white p-6 sm:p-8 shadow-[var(--shadow-card)]">
    <h2 className="text-2xl font-bold text-navy-800">Find your business</h2>
    <p className="mt-2 text-navy-500">Search by business name. Check the location before starting your claim.</p>
    <form onSubmit={search} className="mt-6 flex flex-col gap-3 sm:flex-row">
      <label className="flex-1"><span className="sr-only">Business name</span><input required minLength={2} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter your business name" className="w-full rounded-xl border border-cream-300 px-4 py-3 text-navy-800 focus:outline-gold-600" /></label>
      <button disabled={busy || query.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-800 px-6 py-3 font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}Search</button>
    </form>
    <div aria-live="polite" aria-busy={busy}>
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      {searched && results.length === 0 && <p className="mt-5 text-navy-600">No matching listing found. Try a shorter name, or <Link className="font-semibold underline" href="/contact">contact us to add or locate your business</Link>.</p>}
      {results.length > 0 && <p className="mt-5 text-sm text-navy-500">Showing up to 12 matches. Refine the name if needed.</p>}
      <ul className="mt-3 divide-y divide-cream-200">{results.map(item => <li key={item.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div><Link className="font-semibold text-navy-800 hover:underline" href={"/" + item.islandSlug + "/" + item.slug}>{item.title}</Link><p className="mt-1 flex items-start gap-1 text-sm text-navy-500"><MapPin size={15} className="mt-0.5 shrink-0" />{item.address || item.islandName}</p><p className="text-xs text-navy-400 mt-1">{item.islandName}{item.claimVerified ? " · Ownership verified" : ""}</p></div>
        <Link className="inline-flex shrink-0 items-center gap-2 font-semibold text-gold-700 hover:underline" href={item.claimVerified ? "/contact" : "/auth/signup?role=operator&claim=" + item.id}>{item.claimVerified ? "Need access?" : "Claim this listing"}<ArrowRight size={16} /></Link>
      </li>)}</ul>
    </div>
  </div>;
}
