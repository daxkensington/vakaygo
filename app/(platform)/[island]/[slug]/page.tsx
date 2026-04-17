"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BookingWidget } from "@/components/listings/booking-widget";
import { DiningReservation } from "@/components/listings/dining-reservation";
import { TransferBooking } from "@/components/listings/transfer-booking";
import { ContactInfo } from "@/components/listings/contact-info";
import { ReviewSection } from "@/components/listings/review-section";
import { ShareButton } from "@/components/listings/share-button";
import { PhotoGallery } from "@/components/listings/photo-gallery";
import { TrustBadges } from "@/components/listings/trust-badges";
import { ContactOperator } from "@/components/listings/contact-operator";
import { CancellationPolicy } from "@/components/listings/cancellation-policy";
import { WhatsIncluded } from "@/components/listings/whats-included";
import { TourItinerary } from "@/components/listings/tour-itinerary";
import dynamic from "next/dynamic";

const MeetingPointMap = dynamic(
  () =>
    import("@/components/listings/meeting-point-map").then(
      (m) => m.MeetingPointMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-cream-100 rounded-2xl animate-pulse" />
    ),
  }
);
import { LikelySellOutBadge } from "@/components/listings/likely-sell-out-badge";
import { DiningMenu } from "@/components/listings/dining-menu";
import { SuperhostBadge } from "@/components/shared/superhost-badge";
import { ImageWithFallback } from "@/components/shared/image-fallback";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useSaved } from "@/lib/use-saved";
import { addRecentlyViewed } from "@/lib/recently-viewed";
import { getImageUrl } from "@/lib/image-utils";
import { getIslandFlag } from "@/lib/island-flags";
import { analytics } from "@/lib/analytics";
import {
  Star,
  MapPin,
  Clock,
  Users as UsersIcon,
  Check,
  Shield,
  Loader2,
  Heart,
  Zap,
  Sparkles,
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
  operatorSuperhost?: boolean;
  meetingPointLat: string | null;
  meetingPointLng: string | null;
  meetingPointNote: string | null;
  cancellationPolicy: string | null;
  minStay: number | null;
  maxStay: number | null;
  advanceNotice: number | null;
  maxGuests: number | null;
  images: { id: string; url: string; alt: string | null; type?: string | null }[];
};

type RelatedGuide = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  category: string;
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
  excursion: "Excursion",
  tour: "Tour",
  dining: "Restaurant",
  event: "Event",
  transfer: "Airport Transfer",
  transport: "Transport",
  vip: "VIP Service",
  guide: "Local Guide",
  spa: "Spa & Wellness",
};

const schemaTypeMap: Record<string, string> = {
  stay: "LodgingBusiness",
  excursion: "TouristAttraction",
  tour: "TouristAttraction",
  dining: "Restaurant",
  event: "Event",
  transfer: "TaxiService",
  transport: "TaxiService",
  vip: "LocalBusiness",
  guide: "TouristInformationCenter",
  spa: "HealthAndBeautyBusiness",
};

export default function ListingDetailPage() {
  const params = useParams();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [similar, setSimilar] = useState<SimilarListing[]>([]);
  const [relatedGuides, setRelatedGuides] = useState<RelatedGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const { isSaved, toggle } = useSaved();
  const viewTracked = useRef(false);

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

  // Fetch related guides by island
  useEffect(() => {
    if (!listing) return;
    fetch(`/api/blog?island=${listing.islandSlug}&limit=3`)
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data) => setRelatedGuides(data.posts || []))
      .catch(() => {});
  }, [listing]);

  // Track listing view (once per page load)
  useEffect(() => {
    if (!params.slug || viewTracked.current) return;
    viewTracked.current = true;

    const source = document.referrer.includes("/explore")
      ? "explore"
      : document.referrer.includes("/search")
        ? "search"
        : document.referrer.includes(`/${params.island}`)
          ? "island"
          : "direct";

    fetch(`/api/listings/${params.slug}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }).catch(() => {});
  }, [params.slug, params.island]);

  // Track recently viewed in localStorage
  useEffect(() => {
    if (!listing) return;
    analytics.viewListing(listing.title, listing.type);
    addRecentlyViewed({
      id: listing.id,
      title: listing.title,
      slug: listing.slug,
      type: listing.type,
      priceAmount: listing.priceAmount,
      priceUnit: listing.priceUnit,
      islandSlug: listing.islandSlug,
      image: listing.images.length > 0 ? listing.images[0].url : null,
    });
  }, [listing]);

  // SEO: Update document title and inject JSON-LD structured data
  useEffect(() => {
    if (!listing) return;

    document.title = `${listing.title} — ${listing.islandName} | VakayGo`;

    // Set meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    const desc = listing.description
      ? listing.description.slice(0, 160)
      : `${typeLabels[listing.type] || listing.type} in ${listing.parish}, ${listing.islandName}`;
    if (metaDesc) {
      metaDesc.setAttribute("content", desc);
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = desc;
      document.head.appendChild(meta);
    }

    // Set Open Graph meta tags
    const pageUrl = `https://vakaygo.com/${listing.islandSlug}/${listing.slug}`;
    const ogImageUrl = `/api/og?title=${encodeURIComponent(listing.title)}&subtitle=${encodeURIComponent(listing.islandName)}&type=${listing.type}&rating=${listing.avgRating || ""}&price=${listing.priceAmount || ""}`;

    const ogTags: Record<string, string> = {
      "og:title": `${listing.title} — ${listing.islandName} | VakayGo`,
      "og:description": desc,
      "og:image": ogImageUrl,
      "og:url": pageUrl,
      "og:type": "website",
      "og:site_name": "VakayGo",
      "twitter:card": "summary_large_image",
      "twitter:title": `${listing.title} — ${listing.islandName} | VakayGo`,
      "twitter:description": desc,
      "twitter:image": ogImageUrl,
    };

    Object.entries(ogTags).forEach(([property, content]) => {
      const isTwitter = property.startsWith("twitter:");
      const selector = isTwitter
        ? `meta[name="${property}"]`
        : `meta[property="${property}"]`;
      const existing = document.querySelector(selector);
      if (existing) {
        existing.setAttribute("content", content);
      } else {
        const meta = document.createElement("meta");
        if (isTwitter) {
          meta.setAttribute("name", property);
        } else {
          meta.setAttribute("property", property);
        }
        meta.setAttribute("content", content);
        document.head.appendChild(meta);
      }
    });

    // Build JSON-LD
    const schemaType = schemaTypeMap[listing.type] || "LocalBusiness";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonLd: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": schemaType,
      name: listing.title,
      description: listing.description || undefined,
      url: `https://vakaygo.com/${listing.islandSlug}/${listing.slug}`,
      address: {
        "@type": "PostalAddress",
        addressLocality: listing.parish || undefined,
        addressCountry: listing.islandName,
      },
      image:
        listing.images.length > 0
          ? listing.images.map((img) => img.url)
          : undefined,
    };

    if (listing.avgRating && listing.reviewCount && listing.reviewCount > 0) {
      jsonLd.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: parseFloat(listing.avgRating).toFixed(1),
        reviewCount: listing.reviewCount,
        bestRating: "5",
        worstRating: "1",
      };
    }

    if (listing.priceAmount) {
      const price = parseFloat(listing.priceAmount);
      // Generate human-readable priceRange
      if (price < 20) jsonLd.priceRange = "$";
      else if (price < 50) jsonLd.priceRange = "$$";
      else if (price < 100) jsonLd.priceRange = "$$$";
      else jsonLd.priceRange = "$$$$";

      jsonLd.offers = {
        "@type": "Offer",
        price: listing.priceAmount,
        priceCurrency: listing.priceCurrency || "XCD",
        availability: "https://schema.org/InStock",
      };
    }

    // Opening hours specification from operatingHours
    if (td.operatingHours && typeof td.operatingHours === "object") {
      const dayMap: Record<string, string> = {
        monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
        thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
      };
      const hours = td.operatingHours as Record<string, { open: string; close: string }>;
      jsonLd.openingHoursSpecification = Object.entries(hours)
        .filter(([, v]) => v && v.open && v.close)
        .map(([day, v]) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: dayMap[day.toLowerCase()] || day,
          opens: v.open,
          closes: v.close,
        }));
    }

    // Cuisine type for dining listings
    if (listing.type === "dining" && td.cuisineType) {
      jsonLd.servesCuisine = td.cuisineType as string;
    }

    // Add geo coordinates if available in typeData
    const typeDataGeo = listing.typeData || {};
    const lat = typeDataGeo.latitude || typeDataGeo.lat;
    const lng = typeDataGeo.longitude || typeDataGeo.lng || typeDataGeo.lon;
    if (lat && lng) {
      jsonLd.geo = {
        "@type": "GeoCoordinates",
        latitude: lat,
        longitude: lng,
      };
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(jsonLd);
    script.id = "listing-jsonld";
    const existing = document.getElementById("listing-jsonld");
    if (existing) existing.remove();
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById("listing-jsonld");
      if (el) el.remove();
    };
  }, [listing]);

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
    ? listing.images.map((img: { id: string; url: string; alt: string | null; type?: string | null }) => ({
        id: img.id,
        url: img.url,
        alt: img.alt,
        type: img.type ?? undefined,
      }))
    : [{ id: "placeholder", url: "", alt: listing.title as string | null }];

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        {/* Breadcrumb */}
        <div className="mx-auto max-w-7xl px-6 py-4">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: `${getIslandFlag(listing.islandSlug)} ${listing.islandName}`, href: `/${listing.islandSlug}` },
              { label: listing.title },
            ]}
          />
        </div>

        {/* Image Gallery */}
        <PhotoGallery photos={images} title={listing.title} type={listing.type} />

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
                      {listing.parish}, {getIslandFlag(listing.islandSlug)} {listing.islandName}
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

                  {/* Likely to sell out badge for bookable types */}
                  {["tour", "excursion", "event", "vip"].includes(listing.type) && td.bookingCount7Days !== undefined && (
                    <div className="mt-3">
                      <LikelySellOutBadge
                        bookingCount7Days={td.bookingCount7Days as number}
                        spotsRemaining={td.spotsRemaining as number | undefined}
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <ShareButton
                    title={listing.title}
                    url={typeof window !== "undefined" ? window.location.href : ""}
                  />
                  <button
                    onClick={() => listing && toggle(listing.id)}
                    className={`w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center transition-colors ${
                      listing && isSaved(listing.id)
                        ? "text-red-500"
                        : "text-navy-400 hover:text-red-500"
                    }`}
                  >
                    <Heart
                      size={18}
                      fill={listing && isSaved(listing.id) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              </div>

              {/* Ask AI Button */}
              <button
                onClick={() => {
                  // Set listing context for the concierge
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (window as any).__vakaygo_listing_context = {
                    title: listing.title,
                    slug: listing.slug,
                    island: listing.islandSlug,
                    type: listing.type,
                    price: listing.priceAmount || undefined,
                  };
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const open = (window as any).__vakaygo_concierge_open;
                  if (open) {
                    open(`Tell me about "${listing.title}"`);
                  }
                }}
                className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-gold-500 to-gold-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-[0_2px_12px_rgba(200,145,46,0.3)] hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] hover:scale-[1.02] transition-all duration-200"
              >
                <Sparkles size={16} />
                Ask AI about this
              </button>

              {/* Trust Badges */}
              <div className="mt-4">
                <TrustBadges
                  isInstantBook={listing.isInstantBook}
                  avgRating={listing.avgRating}
                  reviewCount={listing.reviewCount}
                  isFeatured={listing.isFeatured}
                  type={listing.type}
                />
              </div>

              {/* Headline */}
              {listing.headline && (
                <p className="mt-4 text-lg text-navy-500 italic">
                  &ldquo;{listing.headline}&rdquo;
                </p>
              )}

              {/* Operator / Claim Banner */}
              {td.unclaimed ? (
                <div className="mt-8 p-6 bg-gradient-to-r from-gold-500 to-gold-600 rounded-2xl text-white">
                  <h3 className="font-bold text-lg">Is this your business?</h3>
                  <p className="text-white/80 text-sm mt-1">
                    This listing was created from public data. Claim it for free
                    to add photos, pricing, availability, and start receiving
                    bookings.
                  </p>
                  <a
                    href="/auth/signup"
                    className="inline-flex items-center gap-2 bg-white text-gold-600 px-5 py-2.5 rounded-xl font-semibold mt-4 hover:bg-cream-100 transition-colors text-sm"
                  >
                    Claim This Business — Free
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-4 mt-8 p-5 bg-white rounded-2xl shadow-[var(--shadow-card)]">
                  <div className="w-14 h-14 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-xl">
                    {String(listing.operatorName || "V").charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-navy-700">
                        {String(listing.operatorName || "Local Operator")}
                      </p>
                      {listing.operatorSuperhost && (
                        <SuperhostBadge variant="small" />
                      )}
                    </div>
                    <p className="text-sm text-navy-400">
                      Verified VakayGo operator
                    </p>
                  </div>
                  <div className="ml-auto">
                    <Shield size={20} className="text-teal-500" />
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <ContactInfo typeData={listing.typeData} />

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

              {/* Tour Itinerary (tour/excursion types) */}
              {["tour", "excursion"].includes(listing.type) && td.itinerary && Array.isArray(td.itinerary) && (
                <TourItinerary itinerary={td.itinerary as { stopNumber: number; title: string; description: string; duration?: string; time?: string }[]} />
              )}

              {/* Dining Menu */}
              {listing.type === "dining" && td.menu && Array.isArray(td.menu) && (
                <DiningMenu menu={td.menu as { section: string; items: { name: string; description?: string; price?: string }[] }[]} />
              )}

              {/* What's Included / Excluded (tour types) */}
              <WhatsIncluded typeData={listing.typeData} listingType={listing.type} />

              {/* Meeting Point Map (for tour/excursion/transfer types) */}
              {["tour", "excursion", "transfer"].includes(listing.type) &&
                listing.meetingPointLat &&
                listing.meetingPointLng && (
                  <MeetingPointMap
                    lat={parseFloat(listing.meetingPointLat)}
                    lng={parseFloat(listing.meetingPointLng)}
                    note={listing.meetingPointNote || undefined}
                  />
                )}

              {/* Legacy: What's Included (simple list from td.includes) */}
              {td.includes && !td.included && (
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

              {/* Booking Rules */}
              {(listing.minStay || listing.maxStay || listing.advanceNotice || listing.maxGuests) && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-navy-700 mb-4">Booking Rules</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {listing.minStay && listing.minStay > 0 && (
                      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm">
                        <Clock size={16} className="text-gold-500" />
                        <span className="text-sm font-medium text-navy-600">
                          Minimum stay: {listing.minStay} night{listing.minStay > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {listing.maxStay && listing.maxStay > 0 && (
                      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm">
                        <Clock size={16} className="text-gold-500" />
                        <span className="text-sm font-medium text-navy-600">
                          Maximum stay: {listing.maxStay} night{listing.maxStay > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {listing.advanceNotice && listing.advanceNotice > 0 && (
                      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm">
                        <Clock size={16} className="text-gold-500" />
                        <span className="text-sm font-medium text-navy-600">
                          Book at least {listing.advanceNotice} hour{listing.advanceNotice > 1 ? "s" : ""} in advance
                        </span>
                      </div>
                    )}
                    {listing.maxGuests && listing.maxGuests > 0 && (
                      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm">
                        <UsersIcon size={16} className="text-gold-500" />
                        <span className="text-sm font-medium text-navy-600">
                          Up to {listing.maxGuests} guest{listing.maxGuests > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
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
              <div className="mt-8">
                <CancellationPolicy policy={listing.cancellationPolicy} />
              </div>

              {/* Contact Operator */}
              {!td.unclaimed && listing.operatorId && (
                <div className="mt-8">
                  <ContactOperator
                    operatorId={listing.operatorId}
                    operatorName={String(listing.operatorName || "Operator")}
                    listingId={listing.id}
                    listingTitle={listing.title}
                  />
                </div>
              )}

              {/* Reviews */}
              <ReviewSection listingId={listing.id} listingTitle={listing.title} listingType={listing.type} />

              {/* Related Guides */}
              {relatedGuides.length > 0 && (
                <div className="mt-12">
                  <h2
                    className="text-xl font-bold text-navy-700 mb-4"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Related Guides
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {relatedGuides.map((guide) => (
                      <Link
                        key={guide.id}
                        href={`/blog/${guide.slug}`}
                        className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
                      >
                        {guide.coverImage && (
                          <div className="relative h-32 overflow-hidden">
                            <ImageWithFallback
                              src={getImageUrl(guide.coverImage)}
                              type="tour"
                              className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                            />
                          </div>
                        )}
                        <div className="p-4">
                          <span className="text-xs font-semibold text-gold-600 uppercase tracking-wide">
                            {guide.category}
                          </span>
                          <h3 className="font-semibold text-navy-700 mt-1 line-clamp-2 group-hover:text-gold-600 transition-colors">
                            {guide.title}
                          </h3>
                          {guide.excerpt && (
                            <p className="text-sm text-navy-400 mt-1 line-clamp-2">
                              {guide.excerpt}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar — Type-Specific Booking Widget */}
            {listing.type === "dining" ? (
              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <DiningReservation
                    listingId={listing.id}
                    listingTitle={listing.title}
                    operatorId={listing.operatorId}
                  />
                </div>
              </div>
            ) : listing.type === "transfer" ? (
              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <TransferBooking
                    listingId={listing.id}
                    listingTitle={listing.title}
                    priceAmount={listing.priceAmount}
                    priceUnit={listing.priceUnit}
                    typeData={listing.typeData}
                  />
                </div>
              </div>
            ) : (
              <BookingWidget listing={listing} />
            )}
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
                      <ImageWithFallback
                        src={getImageUrl(item.image)}
                        type={item.type}
                        className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                      />
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
