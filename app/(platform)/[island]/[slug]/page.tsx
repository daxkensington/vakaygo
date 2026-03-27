"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BookingWidget } from "@/components/listings/booking-widget";
import {
  Star,
  MapPin,
  Clock,
  Users as UsersIcon,
  Check,
  Shield,
  ChevronLeft,
  Loader2,
  Share2,
  Heart,
  Zap,
} from "lucide-react";

type ListingDetail = {
  id: string;
  title: string;
  slug: string;
  type: string;
  headline: string | null;
  description: string | null;
  address: string | null;
  parish: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  isFeatured: boolean | null;
  isInstantBook: boolean | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeData: Record<string, any> | null;
  islandSlug: string;
  islandName: string;
  operatorName: string | null;
  operatorAvatar: string | null;
  operatorId: string;
  images: { id: string; url: string; alt: string | null }[];
};

type SimilarListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  islandSlug: string;
  image: string | null;
};

const typeLabels: Record<string, string> = {
  stay: "Stay",
  tour: "Tour",
  dining: "Restaurant",
  event: "Event",
  transport: "Transport",
  guide: "Local Guide",
};

export default function ListingDetailPage() {
  const params = useParams();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [similar, setSimilar] = useState<SimilarListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`/api/listings/${params.slug}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setListing(data.listing);
        setSimilar(data.similar || []);
      } catch {
        setListing(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.slug) fetchListing();
  }, [params.slug]);

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={40} className="animate-spin text-gold-500" />
        </div>
      </>
    );
  }

  if (!listing) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 px-6">
          <h1 className="text-2xl font-bold text-navy-700">Listing not found</h1>
          <p className="text-navy-400 mt-2">This experience may no longer be available.</p>
          <Link href="/explore" className="mt-6 bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold">
            Back to Explore
          </Link>
        </div>
      </>
    );
  }

  const td = listing.typeData || {};
  const images = listing.images.length > 0
    ? listing.images
    : [{ id: "placeholder", url: "", alt: listing.title }];

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-navy-400">
            <Link href="/explore" className="hover:text-gold-500 flex items-center gap-1">
              <ChevronLeft size={14} />
              Explore
            </Link>
            <span>/</span>
            <span className="capitalize">{listing.type}s</span>
            <span>/</span>
            <span className="text-navy-600">{listing.title}</span>
          </div>
        </div>

        {/* Image Gallery */}
        <div className="mx-auto max-w-7xl px-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-3xl overflow-hidden h-[400px] md:h-[480px]">
            {/* Main image */}
            <div
              className="bg-cover bg-center bg-cream-200 cursor-pointer"
              style={{
                backgroundImage: images[activeImage]?.url
                  ? `url(${images[activeImage].url})`
                  : undefined,
              }}
            />
            {/* Side images */}
            <div className="hidden md:grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-cover bg-center bg-cream-200 cursor-pointer hover:opacity-90 transition-opacity"
                  style={{
                    backgroundImage: images[i]?.url
                      ? `url(${images[i].url})`
                      : images[0]?.url
                      ? `url(${images[0].url})`
                      : undefined,
                  }}
                  onClick={() => images[i] && setActiveImage(i)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Left Content */}
            <div className="lg:col-span-2">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-gold-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {typeLabels[listing.type] || listing.type}
                    </span>
                    {listing.isInstantBook && (
                      <span className="flex items-center gap-1 bg-teal-50 text-teal-600 text-xs font-semibold px-3 py-1 rounded-full">
                        <Zap size={12} /> Instant Book
                      </span>
                    )}
                  </div>
                  <h1
                    className="text-3xl md:text-4xl font-bold text-navy-700 leading-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {listing.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-navy-400">
                    <div className="flex items-center gap-1">
                      <MapPin size={14} className="text-gold-500" />
                      {listing.parish}, {listing.islandName}
                    </div>
                    {listing.avgRating && parseFloat(listing.avgRating) > 0 && (
                      <div className="flex items-center gap-1">
                        <Star size={14} className="text-gold-500 fill-gold-500" />
                        <span className="font-semibold text-navy-700">
                          {parseFloat(listing.avgRating).toFixed(1)}
                        </span>
                        ({listing.reviewCount} reviews)
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-navy-400 hover:text-gold-500 transition-colors">
                    <Share2 size={18} />
                  </button>
                  <button className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-navy-400 hover:text-red-500 transition-colors">
                    <Heart size={18} />
                  </button>
                </div>
              </div>

              {/* Headline */}
              {listing.headline && (
                <p className="mt-4 text-lg text-navy-500 italic">
                  &ldquo;{listing.headline}&rdquo;
                </p>
              )}

              {/* Operator */}
              <div className="flex items-center gap-4 mt-8 p-5 bg-white rounded-2xl shadow-[var(--shadow-card)]">
                <div className="w-14 h-14 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-xl">
                  {String(listing.operatorName || "V").charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-navy-700">
                    {String(listing.operatorName || "Local Operator")}
                  </p>
                  <p className="text-sm text-navy-400">
                    Verified VakayGo operator
                  </p>
                </div>
                <div className="ml-auto">
                  <Shield size={20} className="text-teal-500" />
                </div>
              </div>

              {/* Quick Info */}
              {listing.typeData && (
                <div className="flex flex-wrap gap-4 mt-8">
                  {td.duration && (
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                      <Clock size={16} className="text-gold-500" />
                      <span className="text-sm font-medium text-navy-600">
                        {td.duration as string}
                      </span>
                    </div>
                  )}
                  {td.maxGroupSize && (
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                      <UsersIcon size={16} className="text-gold-500" />
                      <span className="text-sm font-medium text-navy-600">
                        Max {td.maxGroupSize as number} people
                      </span>
                    </div>
                  )}
                  {td.maxGuests && (
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                      <UsersIcon size={16} className="text-gold-500" />
                      <span className="text-sm font-medium text-navy-600">
                        Up to {td.maxGuests as number} guests
                      </span>
                    </div>
                  )}
                  {td.bedrooms && (
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                      <span className="text-sm font-medium text-navy-600">
                        {td.bedrooms as number} bed · {td.bathrooms as number} bath
                      </span>
                    </div>
                  )}
                  {td.difficulty && (
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                      <span className="text-sm font-medium text-navy-600">
                        {td.difficulty as string}
                      </span>
                    </div>
                  )}
                  {td.cuisineType && (
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                      <span className="text-sm font-medium text-navy-600">
                        {td.cuisineType as string}
                      </span>
                    </div>
                  )}
                  {td.hours && (
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm">
                      <Clock size={16} className="text-gold-500" />
                      <span className="text-sm font-medium text-navy-600">
                        {td.hours as string}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="mt-8">
                <h2 className="text-xl font-bold text-navy-700 mb-4">About</h2>
                <p className="text-navy-500 leading-relaxed whitespace-pre-line">
                  {listing.description}
                </p>
              </div>

              {/* What's Included */}
              {td.includes && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-navy-700 mb-4">
                    What&apos;s Included
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(td.includes as string[]).map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-teal-50 rounded-full flex items-center justify-center">
                          <Check size={14} className="text-teal-500" />
                        </div>
                        <span className="text-navy-600">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Amenities */}
              {td.amenities && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-navy-700 mb-4">
                    Amenities
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(td.amenities as string[]).map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gold-50 rounded-full flex items-center justify-center">
                          <Check size={14} className="text-gold-500" />
                        </div>
                        <span className="text-navy-600">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Languages (guides) */}
              {td.languages && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-navy-700 mb-4">
                    Languages
                  </h2>
                  <div className="flex gap-2">
                    {(td.languages as string[]).map((lang) => (
                      <span
                        key={lang}
                        className="bg-cream-100 text-navy-600 px-4 py-2 rounded-full text-sm font-medium"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cancellation Policy */}
              <div className="mt-8 p-6 bg-white rounded-2xl shadow-[var(--shadow-card)]">
                <h2 className="text-lg font-bold text-navy-700 mb-3">
                  Cancellation Policy
                </h2>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-teal-50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={14} className="text-teal-500" />
                  </div>
                  <div>
                    <p className="font-medium text-navy-700">
                      Free cancellation up to 24 hours before
                    </p>
                    <p className="text-sm text-navy-400 mt-1">
                      Cancel for free up to 24 hours before the start date for a
                      full refund. Cancellations made less than 24 hours in
                      advance are subject to a 50% fee.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sidebar — Booking Widget */}
            <BookingWidget listing={listing} />
          </div>

          {/* Similar Listings */}
          {similar.length > 0 && (
            <div className="mt-16">
              <h2
                className="text-2xl font-bold text-navy-700 mb-6"
                style={{ fontFamily: "var(--font-display)" }}
              >
                You might also like
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {similar.map((item) => (
                  <Link
                    key={item.id}
                    href={`/${item.islandSlug}/${item.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="relative h-44 overflow-hidden">
                      {item.image ? (
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                          style={{ backgroundImage: `url(${item.image})` }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-cream-200" />
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-navy-400">{item.parish}</p>
                      <h3 className="font-semibold text-navy-700 mt-1 line-clamp-1 group-hover:text-gold-600 transition-colors">
                        {item.title}
                      </h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-navy-700">
                          ${item.priceAmount ? parseFloat(item.priceAmount).toFixed(0) : "—"}
                          <span className="text-navy-400 text-sm font-normal">
                            {" "}/ {item.priceUnit}
                          </span>
                        </span>
                        {item.avgRating && (
                          <div className="flex items-center gap-1">
                            <Star size={12} className="text-gold-500 fill-gold-500" />
                            <span className="text-xs font-semibold">
                              {parseFloat(item.avgRating).toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
