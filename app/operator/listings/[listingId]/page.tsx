"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Save,
  Loader2,
  ArrowLeft,
  Eye,
  Trash2,
  Sparkles,
  DollarSign,
  ArrowUpRight,
} from "lucide-react";
import { CATEGORY_RATES } from "@/lib/pricing";
import Link from "next/link";
import PhotoUploader from "@/components/operator/photo-uploader";
import { AIDescriptionButton } from "@/components/operator/ai-description-button";

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
  cancellationPolicy: string | null;
  minStay: number | null;
  maxStay: number | null;
  advanceNotice: number | null;
  maxGuests: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeData: Record<string, any> | null;
  images: { id: string; url: string; alt: string | null }[];
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
  const [cancellationPolicy, setCancellationPolicy] = useState("moderate");
  const [minStay, setMinStay] = useState("");
  const [maxStay, setMaxStay] = useState("");
  const [advanceNotice, setAdvanceNotice] = useState("");
  const [maxGuests, setMaxGuests] = useState("");
  const [includedItems, setIncludedItems] = useState<string[]>([]);
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const [newIncluded, setNewIncluded] = useState("");
  const [newExcluded, setNewExcluded] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [images, setImages] = useState<{ id: string; url: string; alt: string | null }[]>([]);

  // AI Optimizer state
  const [optimizeData, setOptimizeData] = useState<{
    score: number;
    maxScore: number;
    improvements: {
      category: string;
      priority: string;
      suggestion: string;
      action: string | null;
    }[];
    competitivePosition: string;
    estimatedImpact: string;
  } | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  // AI Pricing state
  const [pricingData, setPricingData] = useState<{
    currentPrice: number;
    suggestedPrice: number;
    reasoning: string;
    competitorRange: { low: number; median: number; high: number };
    competitorCount: number;
    seasonalTip: string;
    insights: string[];
  } | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

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
        setCancellationPolicy(l.cancellationPolicy || "moderate");
        setMinStay(l.minStay ? String(l.minStay) : "");
        setMaxStay(l.maxStay ? String(l.maxStay) : "");
        setAdvanceNotice(l.advanceNotice ? String(l.advanceNotice) : "");
        setMaxGuests(l.maxGuests ? String(l.maxGuests) : "");
        const td = l.typeData || {};
        setIncludedItems((td.included as string[]) || []);
        setExcludedItems((td.excluded as string[]) || []);
        setMeetingPoint((td.meetingPoint as string) || "");
        setImages(l.images || []);
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
          cancellationPolicy,
          minStay: minStay ? parseInt(minStay) : null,
          maxStay: maxStay ? parseInt(maxStay) : null,
          advanceNotice: advanceNotice ? parseInt(advanceNotice) : null,
          maxGuests: maxGuests ? parseInt(maxGuests) : null,
          typeData: {
            ...(listing?.typeData || {}),
            included: includedItems.length > 0 ? includedItems : undefined,
            excluded: excludedItems.length > 0 ? excludedItems : undefined,
            meetingPoint: meetingPoint || undefined,
          },
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

  async function fetchOptimization() {
    if (!listing) return;
    setOptimizeLoading(true);
    try {
      const res = await fetch("/api/ai/optimize-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setOptimizeData(data);
    } catch {
      console.error("Failed to fetch optimization");
    } finally {
      setOptimizeLoading(false);
    }
  }

  async function fetchPricing() {
    if (!listing) return;
    setPricingLoading(true);
    try {
      const res = await fetch("/api/ai/pricing-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setPricingData(data);
    } catch {
      console.error("Failed to fetch pricing");
    } finally {
      setPricingLoading(false);
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
        <Link href="/operator/listings" className="text-gold-700 font-semibold mt-4 inline-block">
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-navy-600">Description</label>
                <AIDescriptionButton
                  title={title}
                  type={listing.type}
                  address={address}
                  onGenerated={(desc, hl) => {
                    setDescription(desc);
                    if (hl) setHeadline(hl);
                  }}
                />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-bold text-navy-700 mb-4">Photos</h2>
          <p className="text-sm text-navy-400 mb-4">Add photos to attract more bookings. The first photo will be your cover image.</p>
          <PhotoUploader
            listingId={listing.id}
            existingPhotos={images}
            onPhotosChange={setImages}
          />
        </div>

        {/* AI Listing Optimizer */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-gold-500 rounded-lg flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <h2 className="font-bold text-navy-700">Optimize with AI</h2>
            </div>
            {!optimizeData && (
              <button
                type="button"
                onClick={fetchOptimization}
                disabled={optimizeLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-gold-500 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {optimizeLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Analyze Listing
              </button>
            )}
          </div>

          {optimizeLoading && (
            <div className="flex items-center gap-3 py-8 justify-center text-navy-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Analyzing your listing...</span>
            </div>
          )}

          {optimizeData && (
            <div className="space-y-4">
              {/* Score Circle */}
              <div className="flex items-center gap-6">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      className="text-cream-200"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(optimizeData.score / optimizeData.maxScore) * 213.6} 213.6`}
                      className={
                        optimizeData.score >= 80
                          ? "text-emerald-500"
                          : optimizeData.score >= 50
                            ? "text-amber-500"
                            : "text-red-500"
                      }
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-navy-700">
                      {optimizeData.score}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-navy-700">
                    Listing Score: {optimizeData.score}/{optimizeData.maxScore}
                  </p>
                  <p className="text-sm text-navy-400 capitalize">
                    Position: {optimizeData.competitivePosition.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-navy-300 mt-1">
                    {optimizeData.estimatedImpact}
                  </p>
                </div>
              </div>

              {/* Improvements */}
              <div className="space-y-2">
                {optimizeData.improvements.map((imp, i) => {
                  const priorityBadge =
                    imp.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : imp.priority === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700";
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-cream-50 flex items-start gap-3"
                    >
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${priorityBadge}`}
                      >
                        {imp.priority}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy-500">
                          {imp.category}
                        </p>
                        <p className="text-sm text-navy-600 mt-0.5">
                          {imp.suggestion}
                        </p>
                      </div>
                      {imp.action === "generate_description" && (
                        <button
                          type="button"
                          onClick={() => {
                            // Scroll to description section
                            document
                              .querySelector("textarea")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="text-xs font-medium text-teal-600 hover:text-teal-700 whitespace-nowrap flex items-center gap-1"
                        >
                          Fix <ArrowUpRight size={12} />
                        </button>
                      )}
                      {imp.action === "add_photos" && (
                        <button
                          type="button"
                          onClick={() => {
                            document
                              .getElementById("photos-section")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="text-xs font-medium text-teal-600 hover:text-teal-700 whitespace-nowrap flex items-center gap-1"
                        >
                          Fix <ArrowUpRight size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={fetchOptimization}
                disabled={optimizeLoading}
                className="text-xs font-medium text-navy-400 hover:text-teal-600 transition-colors"
              >
                Re-analyze
              </button>
            </div>
          )}

          {!optimizeData && !optimizeLoading && (
            <p className="text-sm text-navy-400">
              Get AI-powered suggestions to improve your listing and increase
              bookings.
            </p>
          )}
        </div>

        {/* AI Pricing Intelligence */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-gold-500 to-gold-600 rounded-lg flex items-center justify-center">
                <DollarSign size={16} className="text-white" />
              </div>
              <h2 className="font-bold text-navy-700">Pricing Intelligence</h2>
            </div>
            {!pricingData && (
              <button
                type="button"
                onClick={fetchPricing}
                disabled={pricingLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold-700 to-gold-800 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {pricingLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <DollarSign size={14} />
                )}
                Analyze Pricing
              </button>
            )}
          </div>

          {pricingLoading && (
            <div className="flex items-center gap-3 py-8 justify-center text-navy-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Analyzing competitor pricing...</span>
            </div>
          )}

          {pricingData && (
            <div className="space-y-4">
              {/* Price comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-cream-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-navy-700">
                    ${pricingData.currentPrice.toFixed(0)}
                  </p>
                  <p className="text-xs text-navy-400 mt-1">Your Price</p>
                </div>
                <div className="p-4 bg-teal-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-teal-600">
                    ${pricingData.suggestedPrice.toFixed(0)}
                  </p>
                  <p className="text-xs text-teal-600 mt-1">Suggested Price</p>
                </div>
              </div>

              <p className="text-sm text-navy-600">{pricingData.reasoning}</p>

              {/* Competitor range bar */}
              <div>
                <p className="text-xs font-semibold text-navy-500 mb-2">
                  Competitor Range ({pricingData.competitorCount} listings)
                </p>
                <div className="relative h-3 bg-cream-100 rounded-full overflow-hidden">
                  <div
                    className="absolute h-full bg-gold-200 rounded-full"
                    style={{
                      left: "0%",
                      width: "100%",
                    }}
                  />
                  {/* Current price marker */}
                  {pricingData.competitorRange.high > pricingData.competitorRange.low && (
                    <div
                      className="absolute top-0 w-1 h-full bg-navy-700 rounded-full"
                      style={{
                        left: `${Math.min(
                          ((pricingData.currentPrice - pricingData.competitorRange.low) /
                            (pricingData.competitorRange.high - pricingData.competitorRange.low)) *
                            100,
                          100
                        )}%`,
                      }}
                      title={`Your price: $${pricingData.currentPrice}`}
                    />
                  )}
                </div>
                <div className="flex justify-between mt-1 text-xs text-navy-400">
                  <span>${pricingData.competitorRange.low.toFixed(0)}</span>
                  <span>Median: ${pricingData.competitorRange.median.toFixed(0)}</span>
                  <span>${pricingData.competitorRange.high.toFixed(0)}</span>
                </div>
              </div>

              {/* Seasonal tip */}
              <div className="p-3 bg-gold-50 rounded-xl">
                <p className="text-xs font-semibold text-gold-600 mb-0.5">
                  Seasonal Tip
                </p>
                <p className="text-sm text-navy-600">{pricingData.seasonalTip}</p>
              </div>

              {/* Insights */}
              <div className="space-y-1.5">
                {pricingData.insights.map((insight, i) => (
                  <p key={i} className="text-xs text-navy-500 flex items-start gap-2">
                    <span className="text-gold-500 mt-0.5 shrink-0">*</span>
                    {insight}
                  </p>
                ))}
              </div>

              <button
                type="button"
                onClick={fetchPricing}
                disabled={pricingLoading}
                className="text-xs font-medium text-navy-400 hover:text-gold-600 transition-colors"
              >
                Re-analyze
              </button>
            </div>
          )}

          {!pricingData && !pricingLoading && (
            <p className="text-sm text-navy-400">
              See how your pricing compares to similar listings and get AI
              recommendations.
            </p>
          )}
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
                <span className="text-navy-400">VakayGo commission ({((CATEGORY_RATES[listing?.type || "tour"]?.operatorFee || 0.05) * 100).toFixed(0)}%)</span>
                <span className="text-navy-700">-${(parseFloat(price || "0") * (CATEGORY_RATES[listing?.type || "tour"]?.operatorFee || 0.05)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1 pt-2 border-t border-cream-200 font-semibold">
                <span className="text-navy-700">You earn</span>
                <span className="text-teal-600">${(parseFloat(price || "0") * (1 - (CATEGORY_RATES[listing?.type || "tour"]?.operatorFee || 0.05))).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Cancellation Policy */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-bold text-navy-700 mb-4">Cancellation Policy</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { value: "flexible", label: "Flexible", desc: "Free cancel 24h before" },
              { value: "moderate", label: "Moderate", desc: "Free cancel 7 days before" },
              { value: "strict", label: "Strict", desc: "50% refund 14 days before" },
              { value: "non_refundable", label: "Non-Refundable", desc: "No refunds" },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setCancellationPolicy(p.value)}
                className={`p-3 rounded-xl text-left transition-all border-2 ${
                  cancellationPolicy === p.value
                    ? "border-gold-500 bg-gold-50"
                    : "border-cream-200 hover:border-cream-300"
                }`}
              >
                <p className="text-sm font-semibold text-navy-700">{p.label}</p>
                <p className="text-xs text-navy-400 mt-0.5">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Booking Rules */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-bold text-navy-700 mb-4">Booking Rules</h2>
          <div className="grid grid-cols-2 gap-4">
            {listing?.type === "stay" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">Min. Nights</label>
                  <input
                    type="number"
                    min="0"
                    value={minStay}
                    onChange={(e) => setMinStay(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                    placeholder="No minimum"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">Max. Nights</label>
                  <input
                    type="number"
                    min="0"
                    value={maxStay}
                    onChange={(e) => setMaxStay(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                    placeholder="No maximum"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Advance Notice (hours)</label>
              <input
                type="number"
                min="0"
                value={advanceNotice}
                onChange={(e) => setAdvanceNotice(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                placeholder="No requirement"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">Max. Guests</label>
              <input
                type="number"
                min="1"
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                placeholder="Unlimited"
              />
            </div>
          </div>
        </div>

        {/* What's Included / Excluded (tour types) */}
        {["tour", "excursion", "vip", "guide"].includes(listing?.type || "") && (
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-bold text-navy-700 mb-4">What&apos;s Included / Excluded</h2>

            {/* Included */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-navy-600 mb-2">Included</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {includedItems.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 text-sm px-3 py-1.5 rounded-full">
                    {item}
                    <button
                      type="button"
                      onClick={() => setIncludedItems(includedItems.filter((_, idx) => idx !== i))}
                      className="text-teal-400 hover:text-teal-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newIncluded}
                  onChange={(e) => setNewIncluded(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newIncluded.trim()) {
                        setIncludedItems([...includedItems, newIncluded.trim()]);
                        setNewIncluded("");
                      }
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
                  placeholder="e.g. Hotel pickup, Lunch, Equipment"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newIncluded.trim()) {
                      setIncludedItems([...includedItems, newIncluded.trim()]);
                      setNewIncluded("");
                    }
                  }}
                  className="px-4 py-2.5 bg-teal-500 text-white rounded-xl text-sm font-semibold hover:bg-teal-600 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Excluded */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-navy-600 mb-2">Not Included</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {excludedItems.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 text-sm px-3 py-1.5 rounded-full">
                    {item}
                    <button
                      type="button"
                      onClick={() => setExcludedItems(excludedItems.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExcluded}
                  onChange={(e) => setNewExcluded(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newExcluded.trim()) {
                        setExcludedItems([...excludedItems, newExcluded.trim()]);
                        setNewExcluded("");
                      }
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
                  placeholder="e.g. Gratuities, Alcoholic beverages"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newExcluded.trim()) {
                      setExcludedItems([...excludedItems, newExcluded.trim()]);
                      setNewExcluded("");
                    }
                  }}
                  className="px-4 py-2.5 bg-red-400 text-white rounded-xl text-sm font-semibold hover:bg-red-500 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Meeting Point */}
            <div>
              <label className="block text-sm font-semibold text-navy-600 mb-2">Meeting Point</label>
              <input
                type="text"
                value={meetingPoint}
                onChange={(e) => setMeetingPoint(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                placeholder="e.g. St. George's Cruise Port, Grenada"
              />
            </div>
          </div>
        )}

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
              className="bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
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
