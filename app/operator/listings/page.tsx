"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";

export default function ListingsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            My Listings
          </h1>
          <p className="text-navy-400 mt-1">
            Manage your stays, tours, restaurants, and services
          </p>
        </div>
        <Link
          href="/operator/listings/new"
          className="bg-gold-500 hover:bg-gold-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          New Listing
        </Link>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 mb-6 shadow-[var(--shadow-card)]">
        <Search size={18} className="text-navy-300" />
        <input
          type="text"
          placeholder="Search your listings..."
          className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
        />
      </div>

      {/* Empty State */}
      <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
        <div className="w-16 h-16 bg-cream-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Plus size={28} className="text-navy-300" />
        </div>
        <h3 className="text-xl font-bold text-navy-700">No listings yet</h3>
        <p className="text-navy-400 mt-2 max-w-md mx-auto">
          Create your first listing to start reaching travelers on VakayGo. It
          only takes a few minutes.
        </p>
        <Link
          href="/operator/listings/new"
          className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-6"
        >
          <Plus size={18} />
          Create Your First Listing
        </Link>
      </div>
    </div>
  );
}
