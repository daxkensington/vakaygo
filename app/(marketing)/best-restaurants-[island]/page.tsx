import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  getIslandsWithDining,
  getIslandBySlug,
  getTopListingsByType,
  getIslandStats,
} from "@/server/seo-queries";
import { getImageUrl } from "@/lib/image-utils";
import {
  Star,
  MapPin,
  ArrowRight,
  UtensilsCrossed,
  DollarSign,
  Home,
  Compass,
  Sparkles,
  ChevronDown,
} from "lucide-react";

// ─── Static Params ──────────────────────────────────────────────
export async function generateStaticParams() {
  const islands = await getIslandsWithDining();
  return islands.map((island) => ({ island: island.slug }));
}

// ─── Metadata ───────────────────────────────────────────────────
type Props = { params: Promise<{ island: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) return { title: "Not Found" };

  const title = `Best Restaurants in ${island.name} (2026) — Top Dining & Food Guide`;
  const description = `Find the best restaurants in ${island.name}. Explore top-rated dining, local cuisine, seafood, and Caribbean food. Book tables with VakayGo.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://vakaygo.com/best-restaurants-${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://vakaygo.com/best-restaurants-${slug}`,
      type: "website",
      images: [
        {
          url: `https://vakaygo.com/api/og?title=${encodeURIComponent(`Best Restaurants in ${island.name}`)}&subtitle=${encodeURIComponent("Top Dining & Food Guide")}`,
          width: 1200,
          height: 630,
          alt: `Best Restaurants in ${island.name}`,
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

function getPriceRange(priceAmount: string | null): string {
  if (!priceAmount) return "Varies";
  const p = parseFloat(priceAmount);
  if (p < 20) return "$";
  if (p < 50) return "$$";
  if (p < 100) return "$$$";
  return "$$$$";
}

function getCuisineTypes(typeData: Record<string, unknown> | null): string[] {
  if (!typeData) return [];
  const cuisine = typeData.cuisine || typeData.cuisineType || typeData.cuisines;
  if (Array.isArray(cuisine)) return cuisine as string[];
  if (typeof cuisine === "string") return [cuisine];
  return [];
}

function getFaqs(name: string) {
  return [
    {
      q: `What are the best restaurants in ${name}?`,
      a: `${name} has a vibrant dining scene featuring Caribbean cuisine, fresh seafood, local favorites, and international options. VakayGo lists the top-rated restaurants verified by real travelers.`,
    },
    {
      q: `What local food should I try in ${name}?`,
      a: `Caribbean islands are known for fresh seafood, jerk dishes, roti, callaloo, rice and peas, and tropical fruits. Each island has its own specialties. Ask your VakayGo operator for local recommendations.`,
    },
    {
      q: `Do I need reservations at restaurants in ${name}?`,
      a: `Popular restaurants during peak season (December-April) can fill up. We recommend booking ahead through VakayGo for the best dining experiences, especially for groups or special occasions.`,
    },
    {
      q: `What is the average cost of dining in ${name}?`,
      a: `Dining costs vary widely. Local eateries may cost $5-15 per meal, mid-range restaurants $15-40, and fine dining $40+. VakayGo shows prices upfront so you can plan your budget.`,
    },
  ];
}

// ─── Page ───────────────────────────────────────────────────────
export default async function BestRestaurantsPage({ params }: Props) {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) notFound();

  const stats = await getIslandStats(island.id);
  const diningListings = await getTopListingsByType(island.id, "dining", 12);
  const diningCount = stats.typeCounts["dining"] || 0;
  const heroImg = heroImages[slug] || "/images/hero/caribbean-hero.jpg";
  const faqs = getFaqs(island.name);

  // Collect cuisine types from all dining listings
  const allCuisines = new Set<string>();
  diningListings.forEach((l) => {
    getCuisineTypes(l.typeData).forEach((c) => allCuisines.add(c));
  });

  // Price distribution
  const priceDistribution: Record<string, number> = {};
  diningListings.forEach((l) => {
    const range = getPriceRange(l.priceAmount);
    priceDistribution[range] = (priceDistribution[range] || 0) + 1;
  });

  // JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best Restaurants in ${island.name}`,
    description: `Top-rated restaurants and dining experiences in ${island.name}.`,
    url: `https://vakaygo.com/best-restaurants-${slug}`,
    numberOfItems: diningListings.length,
    itemListElement: diningListings.map((listing, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Restaurant",
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
              { label: "Best Restaurants" },
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
                <UtensilsCrossed size={20} className="text-white" />
              </div>
              <p className="text-gold-400 font-semibold text-sm uppercase tracking-widest">
                {island.name} Dining Guide
              </p>
            </div>
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Best Restaurants in {island.name}
            </h1>
            <p className="text-white/70 mt-3 max-w-2xl text-lg">
              Discover {diningCount} top-rated restaurants, from beachfront
              seafood shacks to fine dining. All verified by real travelers.
            </p>
          </div>
        </section>

        {/* Stats Row */}
        <div className="mx-auto max-w-7xl px-6 -mt-8 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">{diningCount}</p>
              <p className="text-xs text-navy-400 mt-1">Restaurants</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">
                {allCuisines.size || "Varied"}
              </p>
              <p className="text-xs text-navy-400 mt-1">Cuisine Types</p>
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

        {/* Cuisine Breakdown */}
        {allCuisines.size > 0 && (
          <section className="py-12">
            <div className="mx-auto max-w-7xl px-6">
              <h2
                className="text-xl font-bold text-navy-700 mb-4"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Cuisine Types in {island.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {Array.from(allCuisines).map((cuisine) => (
                  <span
                    key={cuisine}
                    className="bg-white rounded-full px-4 py-2 text-sm font-medium text-navy-600 shadow-[var(--shadow-card)]"
                  >
                    {cuisine}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Restaurant Listings */}
        <section className="py-12 bg-white">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex items-center justify-between mb-8">
              <h2
                className="text-2xl font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Top-Rated Restaurants
              </h2>
              <Link
                href={`/explore?island=${slug}&type=dining`}
                className="text-gold-500 font-semibold text-sm flex items-center gap-1 hover:text-gold-600 transition-colors"
              >
                View all {diningCount} <ArrowRight size={14} />
              </Link>
            </div>

            {diningListings.length === 0 ? (
              <div className="text-center py-16">
                <UtensilsCrossed
                  size={40}
                  className="text-navy-200 mx-auto mb-4"
                />
                <p className="text-navy-500 font-semibold">
                  No restaurants listed yet for {island.name}
                </p>
                <p className="text-navy-400 text-sm mt-2">
                  Check back soon or explore other islands.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {diningListings.map((listing) => {
                  const imageUrl = getImageUrl(listing.image);
                  const rating = listing.avgRating
                    ? parseFloat(listing.avgRating)
                    : 0;
                  const cuisines = getCuisineTypes(listing.typeData);
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
                          <div className="absolute inset-0 bg-gradient-to-br from-gold-500 to-gold-700 flex items-center justify-center">
                            <UtensilsCrossed
                              size={40}
                              className="text-white/30"
                            />
                          </div>
                        )}
                        {/* Price badge */}
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
                        {cuisines.length > 0 && (
                          <p className="text-xs text-navy-400 mt-1.5 truncate">
                            {cuisines.join(", ")}
                          </p>
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
                                / {listing.priceUnit}
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

        {/* Price Guide */}
        {Object.keys(priceDistribution).length > 0 && (
          <section className="py-12 bg-cream-50">
            <div className="mx-auto max-w-7xl px-6">
              <h2
                className="text-xl font-bold text-navy-700 mb-6"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Price Guide for {island.name} Dining
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "$", range: "Under $20/person", desc: "Local eateries & street food" },
                  { label: "$$", range: "$20-50/person", desc: "Casual restaurants" },
                  { label: "$$$", range: "$50-100/person", desc: "Upscale dining" },
                  { label: "$$$$", range: "$100+/person", desc: "Fine dining" },
                ].map((tier) => (
                  <div
                    key={tier.label}
                    className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign size={16} className="text-gold-500" />
                      <span className="font-bold text-navy-700 text-lg">
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
        )}

        {/* Cross Links */}
        <section className="py-16 bg-white">
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
                className="bg-cream-50 rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 group"
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
                href={`/best-hotels-${slug}`}
                className="bg-cream-50 rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 group"
              >
                <Home size={24} className="text-gold-500 mb-3" />
                <h3 className="font-semibold text-navy-700 group-hover:text-gold-600 transition-colors">
                  Best Hotels in {island.name}
                </h3>
                <p className="text-sm text-navy-400 mt-1">
                  Top stays and accommodations
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
        <section className="py-16 bg-cream-50">
          <div className="mx-auto max-w-3xl px-6">
            <h2
              className="text-2xl font-bold text-navy-700 text-center mb-10"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Dining FAQs for {island.name}
            </h2>
            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <details
                  key={idx}
                  className="group bg-white rounded-2xl overflow-hidden"
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
              Hungry for {island.name}?
            </h2>
            <p className="mt-4 text-white/70 max-w-xl mx-auto">
              Book a table at the best restaurants, explore local cuisine, and
              experience authentic Caribbean dining.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link
                href={`/explore?island=${slug}&type=dining`}
                className="bg-gold-500 hover:bg-gold-600 text-white px-8 py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
              >
                Browse Restaurants <ArrowRight size={16} />
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
