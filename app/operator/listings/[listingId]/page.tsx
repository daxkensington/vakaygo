"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Save, Loader2, ArrowLeft, Eye, Trash2 } from "lucide-react";
import Link from "next/link";

type ListingData = {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  headline: string | null;
  description: string | null;
  address: string | null;
  parish: string | null;
  priceAmount: string | null;
  priceUnit: string | null;
  islandSlug: string;
};

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [parish, setParish] = useState("");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function fetchListing() {
      try {
        // Fetch by slug from the listing detail API
        const res = await fetch(`/api/listings/${params.listingId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const l = data.listing;
        setListing(l);
        setTitle(l.title || "");
        setHeadline(l.headline || "");
        setDescription(l.description || "");
        setAddress(l.address || "");
        setParish(l.parish || "");
        setPrice(l.priceAmount || "");
        setPriceUnit(l.priceUnit || "");
        setStatus(l.status || "draft");
      } catch {
        setListing(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.listingId) fetchListing();
  }, [params.listingId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!listing) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/listings/${listing.slug}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          headline,
          description,
          address,
          parish,
          priceAmount: price ? parseFloat(price) : null,
          priceUnit,
          status,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-gold-500" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="text-center py-20">
        <p className="text-navy-400">Listing not found</p>
        <Link href="/operator/listings" className="text-gold-500 font-semibold mt-4 inline-block">
          Back to listings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/operator/listings" className="text-navy-400 hover:text-navy-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
              Edit Listing
            </h1>
            <p className="text-navy-400 text-sm capitalize">{listing.type}</p>
          </div>
        </div>
        <Link
          href={`/${listing.islandSlug}/${listing.slug}`}
          className="flex items-center gap-2 text-sm text-navy-500 hover:text-gold-500"
        >
          <Eye size={16} />
          View Live
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Status */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-bold text-navy-700 mb-4">Status</h2>
          <div className="flex gap-3">
            {["active", "paused", "draft"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${
                  status === s
                    ? s === "active"
                      ? "bg-teal-500 text-white"
                      : s === "paused"
                        ? "bg-yellow-500 text-white"
                        : "bg-navy-400 text-white"
                    : "bg-cream-50 text-navy-500 hover:bg-cream-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Basic Details */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-bold text-navy-700 mb-4">Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Headline</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                placeholder="A short catchy tagline"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-bold text-navy-700 mb-4">Location</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Parish / Area</label>
              <input
                type="text"
                value={parish}
                onChange={(e) => setParish(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-bold text-navy-700 mb-4">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Price (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-400">$</span>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Per</label>
              <select
                value={priceUnit}
                onChange={(e) => setPriceUnit(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 appearance-none"
              >
                <option value="">Select...</option>
                <option value="night">Night</option>
                <option value="person">Person</option>
                <option value="group">Group</option>
                <option value="trip">Trip</option>
                <option value="hour">Hour</option>
                <option value="avg meal">Avg Meal</option>
                <option value="ticket">Ticket</option>
              </select>
            </div>
          </div>
          {price && (
            <div className="mt-4 p-4 bg-cream-50 rounded-xl text-sm">
              <div className="flex justify-between">
                <span className="text-navy-400">Your price</span>
                <span className="text-navy-700 font-medium">${parseFloat(price || "0").toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-navy-400">VakayGo commission (3%)</span>
                <span className="text-navy-700">-${(parseFloat(price || "0") * 0.03).toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1 pt-2 border-t border-cream-200 font-semibold">
                <span className="text-navy-700">You earn</span>
                <span className="text-teal-600">${(parseFloat(price || "0") * 0.97).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-red-500 hover:text-red-600 text-sm font-medium flex items-center gap-1"
          >
            <Trash2 size={14} />
            Delete Listing
          </button>
          <div className="flex items-center gap-4">
            {saved && <span className="text-sm text-teal-600 font-medium">Saved!</span>}
            <button
              type="submit"
              disabled={saving}
              className="bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Save Changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
