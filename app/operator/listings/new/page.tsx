"use client";

import { useState } from "react";
import {
  Home,
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
  ArrowRight,
  ArrowLeft,
  Upload,
  Loader2,
  Check,
} from "lucide-react";

const listingTypes = [
  {
    id: "stay",
    label: "Stay",
    description: "Villa, guesthouse, apartment, or hotel",
    icon: Home,
    color: "bg-gold-50 text-gold-600 border-gold-200",
    activeColor: "bg-gold-500 text-white border-gold-500",
  },
  {
    id: "tour",
    label: "Tour / Excursion",
    description: "Sailing, hiking, snorkeling, sightseeing",
    icon: Compass,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    activeColor: "bg-teal-500 text-white border-teal-500",
  },
  {
    id: "dining",
    label: "Restaurant / Dining",
    description: "Restaurant, bar, cafe, food truck",
    icon: UtensilsCrossed,
    color: "bg-gold-50 text-gold-600 border-gold-200",
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
    id: "transport",
    label: "Transport",
    description: "Airport transfer, taxi, water taxi, rental",
    icon: Car,
    color: "bg-navy-50 text-navy-600 border-navy-200",
    activeColor: "bg-navy-600 text-white border-navy-600",
  },
  {
    id: "guide",
    label: "Local Guide",
    description: "Private tours, cultural experiences, food tours",
    icon: Users,
    color: "bg-gold-50 text-gold-600 border-gold-200",
    activeColor: "bg-gold-500 text-white border-gold-500",
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
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const totalSteps = 4;

  const priceUnits: Record<string, string[]> = {
    stay: ["night", "week", "month"],
    tour: ["person", "group"],
    dining: ["avg meal"],
    event: ["ticket", "table"],
    transport: ["trip", "person"],
    guide: ["person", "hour", "group"],
  };

  async function handleSubmit() {
    setLoading(true);
    // TODO: API call to create listing
    await new Promise((r) => setTimeout(r, 1500));
    setSubmitted(true);
    setLoading(false);
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
          className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-8"
        >
          View My Listings
        </a>
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
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Description
                </label>
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
            <h2 className="text-xl font-bold text-navy-700 mb-2">
              Add photos
            </h2>
            <p className="text-navy-400 mb-6">
              Great photos are the #1 factor in getting bookings. Add at least 5.
            </p>
            <div className="border-2 border-dashed border-cream-300 rounded-2xl p-12 text-center hover:border-gold-400 transition-colors cursor-pointer">
              <Upload size={40} className="text-navy-300 mx-auto mb-4" />
              <p className="font-semibold text-navy-700">
                Drag and drop your photos here
              </p>
              <p className="text-sm text-navy-400 mt-2">
                or click to browse. JPG, PNG up to 10MB each.
              </p>
              <button className="mt-6 bg-cream-100 hover:bg-cream-200 text-navy-600 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
                Choose Files
              </button>
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
                      VakayGo commission (15%)
                    </span>
                    <span className="text-navy-700 font-medium">
                      -${(parseFloat(price || "0") * 0.15).toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t border-cream-200 pt-2 flex justify-between">
                    <span className="text-navy-700 font-semibold">
                      You earn
                    </span>
                    <span className="text-teal-600 font-bold">
                      ${(parseFloat(price || "0") * 0.85).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
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
              className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
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
