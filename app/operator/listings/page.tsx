"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Loader2,
  MoreVertical,
  Eye,
  Edit,
  Star,
  Home,
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
} from "lucide-react";

type MyListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  priceAmount: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  islandName: string;
  islandSlug: string;
  createdAt: string;
};

const typeIcons: Record<string, typeof Home> = {
  stay: Home, tour: Compass, dining: UtensilsCrossed,
  event: Music, transport: Car, guide: Users,
};

const statusColors: Record<string, string> = {
  active: "bg-teal-50 text-teal-700",
  draft: "bg-navy-50 text-navy-500",
  pending_review: "bg-yellow-50 text-yellow-700",
  paused: "bg-cream-200 text-navy-500",
  rejected: "bg-red-50 text-red-600",
};

export default function ListingsPage() {
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/listings/my")
      .then((r) => r.json())
      .then((data) => setListings(data.listings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = searchQuery
    ? listings.filter((l) => l.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : listings;

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
            {listings.length} listing{listings.length !== 1 ? "s" : ""}
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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <div className="w-16 h-16 bg-cream-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Plus size={28} className="text-navy-300" />
          </div>
          <h3 className="text-xl font-bold text-navy-700">
            {searchQuery ? "No matching listings" : "No listings yet"}
          </h3>
          <p className="text-navy-400 mt-2 max-w-md mx-auto">
            {searchQuery
              ? "Try a different search term."
              : "Create your first listing to start reaching travelers on VakayGo."}
          </p>
          {!searchQuery && (
            <Link
              href="/operator/listings/new"
              className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors mt-6"
            >
              <Plus size={18} />
              Create Your First Listing
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((listing) => {
            const TypeIcon = typeIcons[listing.type] || Compass;
            const statusClass = statusColors[listing.status] || statusColors.draft;
            const rating = listing.avgRating ? parseFloat(listing.avgRating) : 0;

            return (
              <div
                key={listing.id}
                className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow flex items-center gap-4"
              >
                {/* Type icon */}
                <div className="w-12 h-12 bg-cream-50 rounded-xl flex items-center justify-center shrink-0">
                  <TypeIcon size={22} className="text-navy-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-navy-700 truncate">
                      {listing.title}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${statusClass}`}>
                      {listing.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-navy-400">
                    <span className="capitalize">{listing.type}</span>
                    <span>·</span>
                    <span>{listing.islandName}</span>
                    {rating > 0 && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Star size={10} className="text-gold-500 fill-gold-500" />
                          {rating.toFixed(1)}
                        </span>
                      </>
                    )}
                    {listing.priceAmount && parseFloat(listing.priceAmount) > 0 && (
                      <>
                        <span>·</span>
                        <span>${parseFloat(listing.priceAmount).toFixed(0)}/{listing.priceUnit}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/${listing.islandSlug}/${listing.slug}`}
                    className="w-9 h-9 bg-cream-50 rounded-lg flex items-center justify-center text-navy-400 hover:text-navy-600 hover:bg-cream-100 transition-colors"
                    title="View"
                  >
                    <Eye size={16} />
                  </Link>
                  <Link
                    href={`/operator/listings/${listing.id}`}
                    className="w-9 h-9 bg-cream-50 rounded-lg flex items-center justify-center text-navy-400 hover:text-navy-600 hover:bg-cream-100 transition-colors"
                    title="Edit"
                  >
                    <Edit size={16} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
