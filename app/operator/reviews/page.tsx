"use client";

import { Star } from "lucide-react";

export default function OperatorReviewsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reviews
        </h1>
        <p className="text-navy-400 mt-1">
          See what travelers are saying about your listings
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] text-center">
          <div className="flex items-center justify-center gap-1 mb-2">
            <Star size={24} className="text-gold-500 fill-gold-500" />
            <span className="text-3xl font-bold text-navy-700">—</span>
          </div>
          <p className="text-sm text-navy-400">Average Rating</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] text-center">
          <span className="text-3xl font-bold text-navy-700">0</span>
          <p className="text-sm text-navy-400 mt-2">Total Reviews</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] text-center">
          <span className="text-3xl font-bold text-navy-700">0%</span>
          <p className="text-sm text-navy-400 mt-2">Response Rate</p>
        </div>
      </div>

      {/* Empty State */}
      <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
        <Star size={40} className="text-navy-200 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-navy-700">No reviews yet</h3>
        <p className="text-navy-400 mt-2 max-w-md mx-auto">
          When travelers complete bookings at your listings, they&apos;ll be
          prompted to leave a review. Reviews help build trust and attract more
          bookings.
        </p>
      </div>
    </div>
  );
}
