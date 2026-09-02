"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Phone, ShieldCheck } from "lucide-react";

type ListingSummary = {
  id: string;
  title: string;
  type: string;
  address: string | null;
  islandName: string;
  url: string;
  unclaimed: boolean;
  phoneHint: string | null;
};

type ClaimState = {
  id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  adminNotes: string | null;
} | null;

export default function ClaimListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = use(params);
  const [listing, setListing] = useState<ListingSummary | null>(null);
  const [claim, setClaim] = useState<ClaimState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [roleAtBusiness, setRoleAtBusiness] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/listings/claim?listingId=${encodeURIComponent(listingId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load listing");
        if (!cancelled) {
          setListing(data.listing);
          setClaim(data.claim);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load listing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/listings/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, contactName, contactPhone, roleAtBusiness, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit claim");
      setClaim(data.claim);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit claim");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="animate-spin text-gold-700" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="p-8 max-w-xl">
        <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error || "Listing not found"}
        </div>
        <Link href="/operator" className="inline-block mt-4 text-sm text-gold-700 font-semibold">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const form = (
      <form onSubmit={submit} className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mt-6 space-y-4">
        <p className="text-sm text-navy-500 leading-relaxed">
          Tell us who you are and a number we can reach you on. We verify by phone
          {listing?.phoneHint ? (
            <>
              {" "}using the number on file for the business (<span className="font-mono">{listing.phoneHint}</span>)
            </>
          ) : null}
          , then hand the listing over. Claiming is free.
        </p>

        <div>
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Your name</label>
          <input
            required
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="w-full border border-cream-300 rounded-xl px-3 py-2.5 mt-1 text-sm outline-none focus:border-gold-500"
            placeholder="Full name"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Phone we can call</label>
          <div className="flex items-center gap-2 border border-cream-300 rounded-xl px-3 py-2.5 mt-1 focus-within:border-gold-500">
            <Phone size={16} className="text-navy-300" />
            <input
              required
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full text-sm outline-none bg-transparent"
              placeholder="+1 473 ..."
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Your role at the business</label>
          <input
            value={roleAtBusiness}
            onChange={(e) => setRoleAtBusiness(e.target.value)}
            className="w-full border border-cream-300 rounded-xl px-3 py-2.5 mt-1 text-sm outline-none focus:border-gold-500"
            placeholder="Owner, manager, ..."
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Anything we should know</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-cream-300 rounded-xl px-3 py-2.5 mt-1 text-sm outline-none focus:border-gold-500"
            placeholder="Best time to call, a different number for the business, ..."
          />
        </div>

        {error && (
          <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <BadgeCheck size={18} />}
          Submit claim
        </button>
      </form>
  );

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <BadgeCheck className="text-gold-700" size={28} />
        <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
          Claim this business
        </h1>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] mt-4">
        <p className="font-semibold text-navy-700 text-lg">{listing.title}</p>
        <p className="text-sm text-navy-400">
          {listing.islandName} · <span className="capitalize">{listing.type}</span>
          {listing.address ? ` · ${listing.address}` : ""}
        </p>
        <Link href={listing.url} className="text-sm text-gold-700 font-semibold mt-1 inline-block">
          View the public listing
        </Link>
      </div>

      {!listing.unclaimed ? (
        <div className="bg-cream-50 rounded-2xl p-6 mt-6 text-navy-600">
          This listing has already been claimed. If you believe that is a mistake, email{" "}
          <a href="mailto:bookings@vakaygo.com" className="text-gold-700 font-semibold">bookings@vakaygo.com</a>.
        </div>
      ) : claim && claim.status === "pending" ? (
        <div className="bg-teal-50 rounded-2xl p-6 mt-6">
          <div className="flex items-center gap-2 text-teal-700 font-semibold">
            <ShieldCheck size={18} /> Claim under review
          </div>
          <p className="text-sm text-navy-600 mt-2 leading-relaxed">
            We received your claim on{" "}
            {new Date(claim.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}. To stop anyone
            impersonating your business, a member of our team verifies every claim by calling the number listed for the
            business, usually within one business day. You will get an email as soon as it is approved.
          </p>
          <Link href="/operator" className="inline-block mt-4 text-sm text-gold-700 font-semibold">
            Back to dashboard
          </Link>
        </div>
      ) : claim && claim.status === "rejected" ? (
        <div className="bg-red-50 rounded-2xl p-6 mt-6 text-navy-600 text-sm leading-relaxed">
          Your previous claim was not approved{claim.adminNotes ? `: ${claim.adminNotes}` : "."} You can submit a new one
          below, or email <a href="mailto:bookings@vakaygo.com" className="text-gold-700 font-semibold">bookings@vakaygo.com</a>.
          {form}
        </div>
      ) : (
        form
      )}
    </div>
  );
}
