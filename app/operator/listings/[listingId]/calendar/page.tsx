"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, DollarSign, Loader2 } from "lucide-react";
import { AvailabilityCalendar } from "@/components/listings/availability-calendar";

type ListingInfo = {
  id: string;
  title: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
};

export default function OperatorCalendarPage() {
  const params = useParams();
  const listingId = params.listingId as string;
  const [listing, setListing] = useState<ListingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`/api/listings/my`);
        if (!res.ok) throw new Error("Failed to fetch listings");
        const data = await res.json();
        const found = data.listings?.find(
          (l: { id: string }) => l.id === listingId
        );
        if (!found) {
          setError("Listing not found or you do not own it");
        } else {
          setListing({
            id: found.id,
            title: found.title,
            type: found.type,
            priceAmount: found.priceAmount,
            priceUnit: found.priceUnit,
          });
        }
      } catch {
        setError("Failed to load listing");
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [listingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-gold-500" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-8 text-center">
          <p className="text-navy-500">{error || "Listing not found"}</p>
          <Link
            href="/operator/listings"
            className="inline-flex items-center gap-2 mt-4 text-gold-500 hover:text-gold-600 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back to Listings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/operator/listings/${listingId}`}
          className="p-2 rounded-xl hover:bg-cream-100 text-navy-500 transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-navy-800">{listing.title}</h1>
          <p className="text-sm text-navy-400 mt-0.5">
            Availability Calendar
          </p>
        </div>
      </div>

      {/* Base price reference */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-gold-50 rounded-xl flex items-center justify-center">
          <DollarSign size={20} className="text-gold-600" />
        </div>
        <div>
          <p className="text-sm text-navy-400">Base Price</p>
          <p className="text-lg font-bold text-navy-700">
            {listing.priceAmount
              ? `$${parseFloat(listing.priceAmount).toFixed(2)}`
              : "Not set"}
            {listing.priceUnit && (
              <span className="text-sm font-normal text-navy-400 ml-1">
                / {listing.priceUnit}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto">
          <span className="px-3 py-1 bg-cream-100 text-navy-500 text-xs font-medium rounded-full capitalize">
            {listing.type}
          </span>
        </div>
      </div>

      {/* Calendar */}
      <AvailabilityCalendar listingId={listingId} mode="manage" />

      {/* Legend */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
        <h3 className="text-sm font-semibold text-navy-700 mb-3">Legend</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-xs text-teal-600 font-medium">
              15
            </div>
            <span className="text-xs text-navy-500">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cream-200 flex items-center justify-center text-xs text-navy-300 font-medium line-through">
              15
            </div>
            <span className="text-xs text-navy-500">Blocked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white ring-2 ring-gold-400 flex items-center justify-center text-xs text-navy-600 font-medium">
              15
            </div>
            <span className="text-xs text-navy-500">Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-100 ring-2 ring-red-400 flex items-center justify-center text-xs text-red-700 font-medium">
              15
            </div>
            <span className="text-xs text-navy-500">Bulk Select</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-cream-200">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5 text-xs text-navy-500">
              <div className="w-1.5 h-1.5 bg-gold-500 rounded-full" />
              Has bookings
            </div>
            <div className="flex items-center gap-1.5 text-xs text-navy-500">
              <span className="text-[10px] font-semibold text-gold-600">$XX</span>
              Price override
            </div>
            <div className="flex items-center gap-1.5 text-xs text-navy-500">
              <span className="text-[9px] text-teal-500">N left</span>
              Remaining spots
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gold-50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-navy-700 mb-2">
          How to manage availability
        </h3>
        <ul className="text-xs text-navy-500 space-y-1.5 list-disc list-inside">
          <li>Click any future date to set spots, price overrides, or block it</li>
          <li>Use "Block Dates" to select and block multiple dates at once</li>
          <li>
            Dates without availability records use your base price and unlimited
            spots
          </li>
          <li>
            Price overrides only apply to individual dates and override your base
            price
          </li>
        </ul>
      </div>
    </div>
  );
}
