import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  getIslandsWithStays,
  getIslandBySlug,
  getTopListingsByType,
  getIslandStats,
} from "@/server/seo-queries";
import { getImageUrl } from "@/lib/image-utils";
import {
  Star,
  MapPin,
  ArrowRight,
  Home,
  UtensilsCrossed,
  Compass,
  DollarSign,
  Sparkles,
  ChevronDown,
  Wifi,
  Waves,
  Wind,
  ParkingCircle,
  Eye,
} from "lucide-react";

// ─── Static Params ──────────────────────────────────────────────
export async function generateStaticParams() {
  const islands = await getIslandsWithStays();
  return islands.map((island) => ({ island: island.slug }));
}

// ─── Metadata ───────────────────────────────────────────────────
type Props = { params: Promise<{ island: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) return { title: "Not Found" };

  const title = `Best Hotels in ${island.name} (2026) — Top Stays & Accommodations`;
  const description = `Find the best hotels and stays in ${island.name}. Browse top-rated villas, resorts, guesthouses, and vacation rentals. Book with VakayGo.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://vakaygo.com/best-hotels-${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://vakaygo.com/best-hotels-${slug}`,
      type: "website",
      images: [
        {
          url: `https://vakaygo.com/api/og?title=${encodeURIComponent(`Best Hotels in ${island.name}`)}&subtitle=${encodeURIComponent("Top Stays & Accommodations")}`,
          width: 1200,
          height: 630,
          alt: `Best Hotels in ${island.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────
const heroImages: Record<string, string> = {
  grenada: "/images/islands/grenada.jpg",
  barbados: "/images/islands/barbados.jpg",
  jamaica: "/images/islands/jamaica.jpg",
  "trinidad-and-tobago": "/images/islands/trinidad.jpg",
  "st-lucia": "/images/islands/st-lucia.jpg",
  bahamas: "/images/islands/bahamas.jpg",
  aruba: "/images/islands/aruba.jpg",
  curacao: "/images/islands/curacao.jpg",
  "dominican-republic": "/images/islands/dominican-republic.jpg",
  antigua: "/images/islands/antigua.jpg",
};

function getPropertyType(typeData: Record<string, unknown> | null): string {
  if (!typeData) return "Accommodation";
  const pt = typeData.propertyType || typeData.property_type || typeData.type;
  if (typeof pt === "string") return pt;
  return "Accommodation";
}

function getAmenities(typeData: Record<string, unknown> | null): string[] {
  if (!typeData) return [];
  const amenities = typeData.amenities || typeData.facilities;
  if (Array.isArray(amenities)) return amenities as string[];
  return [];
}

function getPriceRange(priceAmount: string | null): string {
  if (!priceAmount) return "Varies";
  const p = parseFloat(priceAmount);
  if (p < 80) return "Budget";
  if (p < 200) return "Mid-Range";
  if (p < 400) return "Upscale";
  return "Luxury";
}

const amenityIcons: Record<string, typeof Wifi> = {
  wifi: Wifi,
  pool: Waves,
  ac: Wind,
  parking: ParkingCircle,
  "ocean-view": Eye,
  "beach-access": Waves,
};

function getFaqs(name: string) {
  return [
    {
      q: `What are the best hotels in ${name}?`,
      a: `${name} offers a range of accommodations from luxury resorts to charming guesthouses and vacation rentals. VakayGo lists the top-rated stays verified by real travelers, with transparent pricing and direct booking.`,
    },
    {
      q: `How much do hotels cost in ${name}?`,
      a: `Hotel prices in ${name} vary by season and property type. Budget guesthouses start around $50-80/night, mid-range hotels $100-200/night, and luxury resorts from $300+/night. Peak season (December-April) commands higher rates.`,
    },
    {
      q: `What type of accommodation is best in ${name}?`,
      a: `It depends on your travel style. Couples may prefer boutique hotels or villas, families enjoy resorts with amenities, and solo travelers often choose guesthouses or hostels. VakayGo lets you filter by property type to find your perfect match.`,
    },
    {
      q: `Should I book a hotel or vacation rental in ${name}?`,
      a: `Hotels offer convenience and services, while vacation rentals provide more space and a local feel. For longer stays, rentals often offer better value. VakayGo lists both options so you can compare directly.`,
    },
  ];
}

// ─── Page ───────────────────────────────────────────────────────
export default async function BestHotelsPage({ params }: Props) {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) notFound();

  const stats = await getIslandStats(island.id);
  const stayListings = await getTopListingsByType(island.id, "stay", 12);
  const stayCount = stats.typeCounts["stay"] || 0;
  const heroImg = heroImages[slug] || "/images/hero/caribbean-hero.jpg";
  const faqs = getFaqs(island.name);

  // Collect property types
  const propertyTypes = new Map<string, number>();
  stayListings.forEach((l) => {
    const pt = getPropertyType(l.typeData);
    propertyTypes.set(pt, (propertyTypes.get(pt) || 0) + 1);
  });

  // Collect all amenities
  const allAmenities = new Set<string>();
  stayListings.forEach((l) => {
    getAmenities(l.typeData).forEach((a) => allAmenities.add(a));
  });

  // Price distribution
  const priceDistribution: Record<string, number> = {};
  stayListings.forEach((l) => {
    const range = getPriceRange(l.priceAmount);
    priceDistribution[range] = (priceDistribution[range] || 0) + 1;
  });

  // JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best Hotels in ${island.name}`,
    description: `Top-rated hotels, villas, and accommodations in ${island.name}.`,
    url: `https://vakaygo.com/best-hotels-${slug}`,
    numberOfItems: stayListings.length,
    itemListElement: stayListings.map((listing, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "LodgingBusiness",
        name: listing.title,
        url: `https://vakaygo.com/${listing.islandSlug}/${listing.slug}`,
        address: {
          "@type": "PostalAddress",
          addressLocality: listing.parish || island.name,
          addressCountry: island.country,
        },
        ...(listing.avgRating && parseFloat(listing.avgRating) > 0
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: listing.avgRating,
                reviewCount: listing.reviewCount || 1,
              },
            }
          : {}),
        ...(listing.priceAmount
          ? {
              priceRange: getPriceRange(listing.priceAmount),
            }
          : {}),
      },
    })),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <>
      <Header />
      <main className="bg-cream-50 min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />

        {/* Breadcrumbs */}
        <div className="mx-auto max-w-7xl px-6 pt-24 pb-2">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: island.name, href: `/${slug}` },
              { label: "Best Hotels" },
            ]}
          />
        </div>

        {/* Hero */}
        <section className="relative h-[380px] md:h-[480px] flex items-end overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImg})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/30 to-transparent" />
          <div className="relative z-10 mx-auto max-w-7xl px-6 pb-14 w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gold-500 rounded-xl flex items-center justify-center">
                <Home size={20} className="text-white" />
              </div>
              <p className="text-gold-400 font-semibold text-sm uppercase tracking-widest">
                {island.name} Accommodation Guide
              </p>
            </div>
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Best Hotels in {island.name}
            </h1>
            <p className="text-white/70 mt-3 max-w-2xl text-lg">
              Browse {stayCount} top-rated stays, from beachfront resorts to
              cozy villas. All verified and bookable directly.
            </p>
          </div>
        </section>

        {/* Stats Row */}
        <div className="mx-auto max-w-7xl px-6 -mt-8 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">{stayCount}</p>
              <p className="text-xs text-navy-400 mt-1">Accommodations</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">
                {propertyTypes.size || "Varied"}
              </p>
              <p className="text-xs text-navy-400 mt-1">Property Types</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">
                {Object.keys(priceDistribution).length > 0
                  ? Object.keys(priceDistribution).sort().join(" - ")
                  : "Varies"}
              </p>
              <p className="text-xs text-navy-400 mt-1">Price Range</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <Star size={20} className="text-gold-500 mx-auto mb-1" />
              <p className="text-xs text-navy-400 mt-1">Traveler Verified</p>
            </div>
          </div>
        </div>

        {/* Property Types */}
        {propertyTypes.size > 0 && (
          <section className="py-12">
            <div className="mx-auto max-w-7xl px-6">
              <h2
                className="text-xl font-bold text-navy-700 mb-4"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Property Types in {island.name}
              </h2>
              <div className="flex flex-wrap gap-3">
                {Array.from(propertyTypes.entries()).map(([type, count]) => (
                  <div
                    key={type}
                    className="bg-white rounded-2xl px-5 py-3 shadow-[var(--shadow-card)] flex items-center gap-2"
                  >
                    <Home size={16} className="text-gold-500" />
                    <span className="font-medium text-navy-700 text-sm">
                      {type}
                    </span>
                    <span className="text-xs text-navy-400">({count})</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Hotel Listings */}
        <section className="py-12 bg-white">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex items-center justify-between mb-8">
              <h2
                className="text-2xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Top-Rated Stays
              </h2>
              <Link
                href={`/explore?island=${slug}&type=stay`}
                className="text-gold-700 font-semibold text-sm flex items-center gap-1 hover:text-gold-600 transition-colors"
              >
                View all {stayCount} <ArrowRight size={14} />
              </Link>
            </div>

            {stayListings.length === 0 ? (
              <div className="text-center py-16">
                <Home size={40} className="text-navy-200 mx-auto mb-4" />
                <p className="text-navy-500 font-semibold">
                  No hotels listed yet for {island.name}
                </p>
                <p className="text-navy-400 text-sm mt-2">
                  Check back soon or explore other islands.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {stayListings.map((listing) => {
                  const imageUrl = getImageUrl(listing.image);
                  const rating = listing.avgRating
                    ? parseFloat(listing.avgRating)
                    : 0;
                  const propertyType = getPropertyType(listing.typeData);
                  const amenities = getAmenities(listing.typeData);
                  const priceRange = getPriceRange(listing.priceAmount);

                  return (
                    <Link
                      key={listing.id}
                      href={`/${listing.islandSlug}/${listing.slug}`}
                      className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
                    >
                      <div className="relative h-48 overflow-hidden">
                        {imageUrl ? (
                          <div
                            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                            style={{ backgroundImage: `url(${imageUrl})` }}
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
                            <Home size={40} className="text-white/30" />
                          </div>
                        )}
                        {/* Property type badge */}
                        <div className="absolute top-3 left-3">
                          <span className="bg-gold-50 text-gold-800 text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm">
                            {propertyType}
                          </span>
                        </div>
                        {/* Price range badge */}
                        <div className="absolute top-3 right-3">
                          <span className="bg-white/90 backdrop-blur-sm text-navy-700 text-xs font-bold px-2.5 py-1 rounded-full">
                            {priceRange}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-navy-400 flex items-center gap-1 truncate">
                            <MapPin size={10} className="shrink-0" />
                            {listing.parish || island.name}
                          </p>
                          {rating > 0 && (
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <Star
                                size={12}
                                className="text-gold-500 fill-gold-500"
                              />
                              <span className="text-xs font-semibold text-navy-700">
                                {rating.toFixed(1)}
                              </span>
                              {listing.reviewCount &&
                                listing.reviewCount > 0 && (
                                  <span className="text-xs text-navy-300">
                                    ({listing.reviewCount})
                                  </span>
                                )}
                            </div>
                          )}
                        </div>
                        <h3 className="font-semibold text-navy-700 leading-snug line-clamp-2 group-hover:text-gold-600 transition-colors">
                          {listing.title}
                        </h3>
                        {/* Amenity pills */}
                        {amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {amenities.slice(0, 4).map((amenity) => (
                              <span
                                key={amenity}
                                className="text-[10px] text-navy-500 bg-cream-100 rounded-full px-2 py-0.5"
                              >
                                {amenity}
                              </span>
                            ))}
                            {amenities.length > 4 && (
                              <span className="text-[10px] text-navy-400">
                                +{amenities.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                        {listing.priceAmount &&
                          parseFloat(listing.priceAmount) > 0 && (
                            <p className="mt-2">
                              <span className="font-bold text-navy-700">
                                $
                                {parseFloat(listing.priceAmount).toFixed(0)}
                              </span>
                              <span className="text-navy-400 text-sm">
                                {" "}
                                / {listing.priceUnit || "night"}
                              </span>
                            </p>
                          )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Amenity Highlights */}
        {allAmenities.size > 0 && (
          <section className="py-12 bg-cream-50">
            <div className="mx-auto max-w-7xl px-6">
              <h2
                className="text-xl font-bold text-navy-700 mb-6"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Popular Amenities
              </h2>
              <div className="flex flex-wrap gap-3">
                {Array.from(allAmenities)
                  .slice(0, 12)
                  .map((amenity) => {
                    const AmenityIcon =
                      amenityIcons[amenity.toLowerCase()] || Sparkles;
                    return (
                      <div
                        key={amenity}
                        className="bg-white rounded-2xl px-5 py-3 shadow-[var(--shadow-card)] flex items-center gap-2"
                      >
                        <AmenityIcon size={16} className="text-teal-500" />
                        <span className="font-medium text-navy-700 text-sm">
                          {amenity}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        {/* Price Guide */}
        <section className="py-12 bg-white">
          <div className="mx-auto max-w-7xl px-6">
            <h2
              className="text-xl font-bold text-navy-700 mb-6"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {island.name} Accommodation Price Guide
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Budget", range: "Under $80/night", desc: "Guesthouses & hostels" },
                { label: "Mid-Range", range: "$80-200/night", desc: "Hotels & apartments" },
                { label: "Upscale", range: "$200-400/night", desc: "Boutique hotels & villas" },
                { label: "Luxury", range: "$400+/night", desc: "Resorts & luxury villas" },
              ].map((tier) => (
                <div
                  key={tier.label}
                  className="bg-cream-50 rounded-2xl p-5 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign size={16} className="text-gold-500" />
                    <span className="font-bold text-navy-700">
                      {tier.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-navy-600">
                    {tier.range}
                  </p>
                  <p className="text-xs text-navy-400 mt-1">{tier.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cross Links */}
        <section className="py-16 bg-cream-50">
          <div className="mx-auto max-w-7xl px-6">
            <h2
              className="text-2xl font-bold text-navy-700 mb-8"
              style={{ fontFamily: "var(--font-display)" }}
            >
              More in {island.name}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link
                href={`/things-to-do-in-${slug}`}
                className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 group"
              >
                <Compass size={24} className="text-teal-500 mb-3" />
                <h3 className="font-semibold text-navy-700 group-hover:text-gold-600 transition-colors">
                  Things to Do in {island.name}
                </h3>
                <p className="text-sm text-navy-400 mt-1">
                  All activities and experiences
                </p>
              </Link>
              <Link
                href={`/best-restaurants-${slug}`}
                className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 group"
              >
                <UtensilsCrossed size={24} className="text-gold-500 mb-3" />
                <h3 className="font-semibold text-navy-700 group-hover:text-gold-600 transition-colors">
                  Best Restaurants in {island.name}
                </h3>
                <p className="text-sm text-navy-400 mt-1">
                  Top-rated dining experiences
                </p>
              </Link>
              <Link
                href={`/trips/new`}
                className="bg-gradient-to-br from-gold-500 to-gold-600 rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300"
              >
                <Sparkles size={24} className="text-white mb-3" />
                <h3 className="font-semibold text-white">
                  Plan Your {island.name} Trip
                </h3>
                <p className="text-sm text-white/80 mt-1">
                  AI-powered itinerary builder
                </p>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 bg-white">
          <div className="mx-auto max-w-3xl px-6">
            <h2
              className="text-2xl font-bold text-navy-700 text-center mb-10"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Hotel FAQs for {island.name}
            </h2>
            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <details
                  key={idx}
                  className="group bg-cream-50 rounded-2xl overflow-hidden"
                >
                  <summary className="flex items-center justify-between cursor-pointer px-6 py-5 text-navy-700 font-semibold hover:text-gold-600 transition-colors list-none">
                    {faq.q}
                    <ChevronDown
                      size={18}
                      className="text-navy-400 transition-transform group-open:rotate-180 shrink-0 ml-4"
                    />
                  </summary>
                  <div className="px-6 pb-5 text-navy-500 leading-relaxed">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-navy-700 to-navy-900">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Find your perfect stay in {island.name}
            </h2>
            <p className="mt-4 text-white/70 max-w-xl mx-auto">
              Book directly with verified local operators. Lowest commissions
              mean better prices for you and more revenue for local hosts.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link
                href={`/explore?island=${slug}&type=stay`}
                className="bg-gold-500 hover:bg-gold-600 text-white px-8 py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
              >
                Browse Stays <ArrowRight size={16} />
              </Link>
              <Link
                href={`/things-to-do-in-${slug}`}
                className="bg-white/10 text-white border border-white/20 px-8 py-3.5 rounded-xl font-semibold hover:bg-white/20 transition-colors"
              >
                All Things to Do
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
