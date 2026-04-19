"use client";

import { useState } from "react";
import {
  Home,
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Upload,
  Loader2,
  Check,
} from "lucide-react";
import { CATEGORY_RATES } from "@/lib/pricing";
import PhotoUploader from "@/components/operator/photo-uploader";
import { AIDescriptionButton } from "@/components/operator/ai-description-button";

const listingTypes = [
  {
    id: "stay",
    label: "Stay",
    description: "Villa, guesthouse, apartment, or hotel",
    icon: Home,
    color: "bg-gold-50 text-gold-700 border-gold-200",
    activeColor: "bg-gold-500 text-white border-gold-500",
  },
  {
    id: "excursion",
    label: "Excursion",
    description: "Boat trips, island hopping, snorkeling, adventure days",
    icon: Compass,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    activeColor: "bg-teal-500 text-white border-teal-500",
  },
  {
    id: "tour",
    label: "Tour",
    description: "Walking tours, sightseeing, cultural tours, food tours",
    icon: Compass,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    activeColor: "bg-teal-600 text-white border-teal-600",
  },
  {
    id: "dining",
    label: "Restaurant / Dining",
    description: "Restaurant, bar, cafe, food truck",
    icon: UtensilsCrossed,
    color: "bg-gold-50 text-gold-700 border-gold-200",
    activeColor: "bg-gold-600 text-white border-gold-600",
  },
  {
    id: "event",
    label: "Event",
    description: "Fete, festival, concert, party",
    icon: Music,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    activeColor: "bg-teal-600 text-white border-teal-600",
  },
  {
    id: "transfer",
    label: "Airport Transfer",
    description: "Airport pickup/dropoff, meet & greet, flight tracking",
    icon: Car,
    color: "bg-navy-50 text-navy-600 border-navy-200",
    activeColor: "bg-navy-500 text-white border-navy-500",
  },
  {
    id: "transport",
    label: "Transport",
    description: "Car rental, taxi, water taxi, ferry",
    icon: Car,
    color: "bg-navy-50 text-navy-600 border-navy-200",
    activeColor: "bg-navy-600 text-white border-navy-600",
  },
  {
    id: "vip",
    label: "VIP Services",
    description: "Security, concierge, luxury transfers, executive protection",
    icon: Users,
    color: "bg-gold-50 text-gold-700 border-gold-200",
    activeColor: "bg-gold-600 text-white border-gold-600",
  },
  {
    id: "guide",
    label: "Local Guide",
    description: "Private guides, cultural experiences, nature experts",
    icon: Users,
    color: "bg-gold-50 text-gold-700 border-gold-200",
    activeColor: "bg-gold-500 text-white border-gold-500",
  },
  {
    id: "spa",
    label: "Spa & Wellness",
    description: "Spa treatments, massages, wellness retreats, beauty services",
    icon: Sparkles,
    color: "bg-pink-50 text-pink-600 border-pink-200",
    activeColor: "bg-pink-500 text-white border-pink-500",
  },
];

export default function NewListingPage() {
  const [step, setStep] = useState(1);
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("night");
  const [address, setAddress] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("moderate");
  const [maxGuests, setMaxGuests] = useState("");
  const [advanceNotice, setAdvanceNotice] = useState("");
  const [minStay, setMinStay] = useState("");
  const [includedItems, setIncludedItems] = useState<string[]>([]);
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const [newIncluded, setNewIncluded] = useState("");
  const [newExcluded, setNewExcluded] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdListingId, setCreatedListingId] = useState("");

  const isTourType = ["tour", "excursion", "vip", "guide"].includes(type);
  const totalSteps = 5;

  const priceUnits: Record<string, string[]> = {
    stay: ["night", "week", "month"],
    excursion: ["person", "group", "boat"],
    tour: ["person", "group"],
    dining: ["avg meal"],
    event: ["ticket", "table"],
    transfer: ["trip", "person", "vehicle"],
    transport: ["trip", "person", "day"],
    vip: ["hour", "day", "person", "event"],
    guide: ["person", "hour", "group"],
    spa: ["treatment", "hour", "package"],
  };

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/session");
      const session = await res.json();
      if (!session.user) {
        setLoading(false);
        return;
      }

      const createRes = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: session.user.id,
          type,
          title,
          description,
          address,
          priceAmount: price ? parseFloat(price) : null,
          priceCurrency: "USD",
          priceUnit,
          cancellationPolicy,
          minStay: minStay ? parseInt(minStay) : null,
          maxGuests: maxGuests ? parseInt(maxGuests) : null,
          advanceNotice: advanceNotice ? parseInt(advanceNotice) : null,
          typeData: isTourType ? {
            included: includedItems.length > 0 ? includedItems : undefined,
            excluded: excludedItems.length > 0 ? excludedItems : undefined,
            meetingPoint: meetingPoint || undefined,
          } : undefined,
        }),
      });

      if (createRes.ok) {
        const data = await createRes.json();
        setCreatedListingId(data.listing?.id || "");
        setSubmitted(true);
      }
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-20 h-20 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-8">
          <Check size={36} className="text-white" />
        </div>
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Listing submitted!
        </h1>
        <p className="text-navy-400 mt-4 max-w-md mx-auto">
          Your listing is being reviewed and will be live within 24 hours.
          We&apos;ll notify you by email when it&apos;s published.
        </p>
        <a
          href="/operator/listings"
          className="inline-flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-8"
        >
          View My Listings
        </a>
        {createdListingId && (
          <div className="mt-8 max-w-2xl mx-auto text-left">
            <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
              <h2 className="font-bold text-navy-700 mb-2">Add Photos</h2>
              <p className="text-sm text-navy-400 mb-4">Great photos are the #1 factor in getting bookings.</p>
              <PhotoUploader listingId={createdListingId} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1
            className="text-2xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Create a Listing
          </h1>
          <span className="text-sm text-navy-400">
            Step {step} of {totalSteps}
          </span>
        </div>
        <div className="h-2 bg-cream-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold-500 rounded-full transition-all duration-500"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
        {/* Step 1: Choose Type */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-navy-700 mb-2">
              What are you listing?
            </h2>
            <p className="text-navy-400 mb-6">
              Choose the type that best describes your offering
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {listingTypes.map((lt) => (
                <button
                  key={lt.id}
                  onClick={() => {
                    setType(lt.id);
                    setPriceUnit(priceUnits[lt.id]?.[0] || "unit");
                  }}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    type === lt.id ? lt.activeColor : `${lt.color} hover:border-navy-200`
                  }`}
                >
                  <lt.icon size={24} />
                  <div>
                    <p className="font-semibold">{lt.label}</p>
                    <p className={`text-xs mt-0.5 ${type === lt.id ? "text-white/80" : "text-navy-400"}`}>
                      {lt.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Basic Details */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-navy-700 mb-2">
              Tell us about it
            </h2>
            <p className="text-navy-400 mb-6">
              Add the core details travelers will see
            </p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                  placeholder="Give it a catchy, descriptive title"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-navy-600">
                    Description
                  </label>
                  <AIDescriptionButton
                    title={title}
                    type={type}
                    address={address}
                    onGenerated={(desc) => {
                      setDescription(desc);
                    }}
                  />
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 resize-none"
                  placeholder="Describe what makes this special. What will travelers experience?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Location / Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                  placeholder="Address or area in Grenada"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Photos */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-navy-700 mb-2">Photos</h2>
            <p className="text-navy-400 mb-6">
              You&apos;ll be able to upload photos right after submitting your listing. Great photos are the #1 factor in getting bookings — plan to add at least 5.
            </p>
            <div className="bg-cream-50 rounded-2xl p-8 text-center">
              <Upload size={40} className="text-gold-400 mx-auto mb-4" />
              <p className="font-semibold text-navy-700">Photo upload available after submission</p>
              <p className="text-sm text-navy-400 mt-2">Continue to set your pricing, then you&apos;ll add photos on the next screen.</p>
            </div>
          </div>
        )}

        {/* Step 4: Pricing */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-bold text-navy-700 mb-2">
              Set your price
            </h2>
            <p className="text-navy-400 mb-6">
              You can always change this later
            </p>
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    Price (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-400 font-medium">
                      $
                    </span>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="w-40">
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    Per
                  </label>
                  <select
                    value={priceUnit}
                    onChange={(e) => setPriceUnit(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 appearance-none"
                  >
                    {(priceUnits[type] || ["unit"]).map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-cream-50 rounded-xl p-5">
                <h4 className="font-semibold text-navy-700 text-sm mb-3">
                  Commission breakdown
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-navy-400">Your price</span>
                    <span className="text-navy-700 font-medium">
                      ${price || "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-400">
                      VakayGo commission ({((CATEGORY_RATES[type]?.operatorFee || 0.05) * 100).toFixed(0)}%)
                    </span>
                    <span className="text-navy-700 font-medium">
                      -${(parseFloat(price || "0") * (CATEGORY_RATES[type]?.operatorFee || 0.05)).toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t border-cream-200 pt-2 flex justify-between">
                    <span className="text-navy-700 font-semibold">
                      You earn
                    </span>
                    <span className="text-teal-600 font-bold">
                      ${(parseFloat(price || "0") * (1 - (CATEGORY_RATES[type]?.operatorFee || 0.05))).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Rules & Policies */}
        {step === 5 && (
          <div>
            <h2 className="text-xl font-bold text-navy-700 mb-2">
              Rules & Policies
            </h2>
            <p className="text-navy-400 mb-6">
              Set cancellation policy and booking rules
            </p>
            <div className="space-y-6">
              {/* Cancellation Policy */}
              <div>
                <label className="block text-sm font-semibold text-navy-600 mb-3">
                  Cancellation Policy
                </label>
                <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-4">
                {type === "stay" && (
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

              {/* Included / Excluded (tour types) */}
              {isTourType && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">What&apos;s Included</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {includedItems.map((item, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 text-sm px-3 py-1.5 rounded-full">
                          {item}
                          <button type="button" onClick={() => setIncludedItems(includedItems.filter((_, idx) => idx !== i))} className="text-teal-400 hover:text-teal-600">&times;</button>
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
                            if (newIncluded.trim()) { setIncludedItems([...includedItems, newIncluded.trim()]); setNewIncluded(""); }
                          }
                        }}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
                        placeholder="e.g. Hotel pickup, Lunch"
                      />
                      <button type="button" onClick={() => { if (newIncluded.trim()) { setIncludedItems([...includedItems, newIncluded.trim()]); setNewIncluded(""); } }} className="px-4 py-2.5 bg-teal-500 text-white rounded-xl text-sm font-semibold hover:bg-teal-600 transition-colors">Add</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">Not Included</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {excludedItems.map((item, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 text-sm px-3 py-1.5 rounded-full">
                          {item}
                          <button type="button" onClick={() => setExcludedItems(excludedItems.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">&times;</button>
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
                            if (newExcluded.trim()) { setExcludedItems([...excludedItems, newExcluded.trim()]); setNewExcluded(""); }
                          }
                        }}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
                        placeholder="e.g. Gratuities, Alcoholic beverages"
                      />
                      <button type="button" onClick={() => { if (newExcluded.trim()) { setExcludedItems([...excludedItems, newExcluded.trim()]); setNewExcluded(""); } }} className="px-4 py-2.5 bg-red-400 text-white rounded-xl text-sm font-semibold hover:bg-red-500 transition-colors">Add</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-navy-600 mb-2">Meeting Point</label>
                    <input
                      type="text"
                      value={meetingPoint}
                      onChange={(e) => setMeetingPoint(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                      placeholder="e.g. St. George's Cruise Port"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-cream-200">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 text-navy-500 hover:text-navy-700 font-medium transition-colors"
            >
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !type}
              className="flex items-center gap-2 bg-gold-700 hover:bg-gold-800 disabled:opacity-40 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
            >
              Continue
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Submit Listing
                  <Check size={16} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
