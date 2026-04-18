import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  getActiveIslands,
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
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
  Sparkles,
  ChevronDown,
} from "lucide-react";

// ─── Static Params ──────────────────────────────────────────────
export async function generateStaticParams() {
  const islands = await getActiveIslands();
  return islands.map((island) => ({ island: island.slug }));
}

// ─── Metadata ───────────────────────────────────────────────────
type Props = { params: Promise<{ island: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) return { title: "Not Found" };

  const title = `Things to Do in ${island.name} (2026) — Top Attractions & Experiences`;
  const description = `Discover the best things to do in ${island.name}. Explore top tours, restaurants, hotels, events, and local experiences. Plan your ${island.name} trip with VakayGo.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://vakaygo.com/things-to-do-in-${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://vakaygo.com/things-to-do-in-${slug}`,
      type: "website",
      images: [
        {
          url: `https://vakaygo.com/api/og?title=${encodeURIComponent(`Things to Do in ${island.name}`)}&subtitle=${encodeURIComponent("Tours, Dining, Stays & More")}`,
          width: 1200,
          height: 630,
          alt: `Things to Do in ${island.name}`,
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

// ─── Island hero images ─────────────────────────────────────────
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

const sectionConfig = [
  { type: "tour", label: "Tours & Excursions", icon: Compass, color: "bg-teal-500" },
  { type: "excursion", label: "Excursions & Adventures", icon: Compass, color: "bg-teal-600" },
  { type: "dining", label: "Where to Eat", icon: UtensilsCrossed, color: "bg-gold-600" },
  { type: "stay", label: "Where to Stay", icon: Home, color: "bg-gold-500" },
  { type: "event", label: "Events & Festivals", icon: Music, color: "bg-teal-600" },
  { type: "transport", label: "Getting Around", icon: Car, color: "bg-navy-500" },
  { type: "transfer", label: "Airport Transfers", icon: Car, color: "bg-navy-600" },
  { type: "vip", label: "VIP Experiences", icon: Users, color: "bg-gold-600" },
  { type: "guide", label: "Local Guides", icon: Users, color: "bg-gold-500" },
] as const;

const typeFallbacks: Record<string, string> = {
  stay: "from-gold-400 to-gold-600",
  tour: "from-teal-400 to-teal-600",
  excursion: "from-teal-500 to-teal-700",
  dining: "from-gold-500 to-gold-700",
  event: "from-teal-500 to-teal-700",
  transport: "from-navy-400 to-navy-600",
  transfer: "from-navy-500 to-navy-700",
  vip: "from-gold-500 to-gold-700",
  guide: "from-gold-400 to-teal-500",
};

function getFaqs(name: string) {
  return [
    {
      q: `What are the top things to do in ${name}?`,
      a: `${name} offers a wide range of activities including guided tours, snorkeling, hiking, fine dining, cultural events, and beach excursions. Use VakayGo to discover and book the best local experiences rated by real travelers.`,
    },
    {
      q: `When is the best time to visit ${name}?`,
      a: `The Caribbean dry season (December to April) is generally the best time to visit ${name}, with warm temperatures and less rainfall. However, the wet season (June to November) offers lower prices and fewer crowds.`,
    },
    {
      q: `How do I get around ${name}?`,
      a: `You can explore ${name} by taxi, rental car, local minibus, or private transfer. VakayGo offers transport and transfer options so you can book rides directly from verified local operators.`,
    },
    {
      q: `Is ${name} safe for tourists?`,
      a: `${name} is generally a safe destination for tourists. Like any travel destination, use common sense, stay in well-traveled areas, and book with verified operators on VakayGo for a safe, authentic experience.`,
    },
    {
      q: `What is the local currency in ${name}?`,
      a: `Most Caribbean islands use the Eastern Caribbean Dollar (XCD), though US dollars are widely accepted. VakayGo shows prices in your preferred currency so you always know the cost upfront.`,
    },
  ];
}

// ─── Page ───────────────────────────────────────────────────────
export default async function ThingsToDoPage({ params }: Props) {
  const { island: slug } = await params;
  const island = await getIslandBySlug(slug);
  if (!island) notFound();

  const stats = await getIslandStats(island.id);

  // Fetch listings for each type that has listings
  const sectionData = await Promise.all(
    sectionConfig.map(async (section) => {
      if (!stats.typeCounts[section.type]) return null;
      const items = await getTopListingsByType(island.id, section.type, 6);
      if (items.length === 0) return null;
      return { ...section, listings: items };
    })
  );

  const activeSections = sectionData.filter(Boolean) as NonNullable<
    (typeof sectionData)[number]
  >[];

  const heroImg = heroImages[slug] || "/images/hero/caribbean-hero.jpg";
  const faqs = getFaqs(island.name);

  // JSON-LD ItemList
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Things to Do in ${island.name}`,
    description: `Top activities, tours, restaurants, and experiences in ${island.name}.`,
    url: `https://vakaygo.com/things-to-do-in-${slug}`,
    numberOfItems: stats.totalListings,
    itemListElement: activeSections.flatMap((section, sIdx) =>
      section.listings.map((listing, lIdx) => ({
        "@type": "ListItem",
        position: sIdx * 6 + lIdx + 1,
        name: listing.title,
        url: `https://vakaygo.com/${listing.islandSlug}/${listing.slug}`,
      }))
    ),
  };

  // FAQ JSON-LD
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
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
              { label: "Things to Do" },
            ]}
          />
        </div>

        {/* Hero */}
        <section className="relative h-[400px] md:h-[520px] flex items-end overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImg})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/30 to-transparent" />
          <div className="relative z-10 mx-auto max-w-7xl px-6 pb-14 w-full">
            <p className="text-gold-400 font-semibold text-sm uppercase tracking-widest mb-3">
              {island.name} Travel Guide
            </p>
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Things to Do in {island.name}
            </h1>
            <p className="text-white/70 mt-3 max-w-2xl text-lg">
              {island.description ||
                `Discover the best activities, tours, dining, and experiences in ${island.name}. Book directly with local operators on VakayGo.`}
            </p>
            <div className="flex items-center gap-6 mt-5 text-sm text-white/60">
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {island.country}
              </span>
              <span>{stats.totalListings} experiences</span>
              {stats.avgRating > 0 && (
                <span className="flex items-center gap-1">
                  <Star size={14} className="text-gold-400 fill-gold-400" />
                  {stats.avgRating.toFixed(1)} avg rating
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Quick Stats */}
        <div className="mx-auto max-w-7xl px-6 -mt-8 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">
                {stats.totalListings}
              </p>
              <p className="text-xs text-navy-400 mt-1">Total Listings</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">
                {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "New"}
              </p>
              <p className="text-xs text-navy-400 mt-1">Avg Rating</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <p className="text-2xl font-bold text-navy-700">
                {Object.keys(stats.typeCounts).length}
              </p>
              <p className="text-xs text-navy-400 mt-1">Categories</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <Sparkles size={20} className="text-gold-500 mx-auto mb-1" />
              <p className="text-xs text-navy-400 mt-1">Verified Operators</p>
            </div>
          </div>
        </div>

        {/* Listing Sections */}
        {activeSections.map((section, idx) => (
          <section
            key={section.type}
            className={`py-16 ${idx % 2 === 0 ? "bg-cream-50" : "bg-white"}`}
          >
            <div className="mx-auto max-w-7xl px-6">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 ${section.color} rounded-xl flex items-center justify-center`}
                  >
                    <section.icon size={20} className="text-white" />
                  </div>
                  <div>
                    <h2
                      className="text-2xl font-bold text-navy-700"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {section.label} in {island.name}
                    </h2>
                    <p className="text-sm text-navy-400">
                      {stats.typeCounts[section.type] || 0} options available
                    </p>
                  </div>
                </div>
                <Link
                  href={`/explore?island=${slug}&type=${section.type}`}
                  className="text-gold-700 font-semibold text-sm flex items-center gap-1 hover:text-gold-600 transition-colors"
                >
                  View all <ArrowRight size={14} />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {section.listings.map((listing) => {
                  const imageUrl = getImageUrl(listing.image);
                  const rating = listing.avgRating
                    ? parseFloat(listing.avgRating)
                    : 0;
                  const fallback =
                    typeFallbacks[listing.type] || "from-navy-400 to-navy-600";
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
                          <div
                            className={`absolute inset-0 bg-gradient-to-br ${fallback} flex items-center justify-center`}
                          >
                            <section.icon
                              size={40}
                              className="text-white/30"
                            />
                          </div>
                        )}
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
                        {listing.priceAmount &&
                          parseFloat(listing.priceAmount) > 0 && (
                            <p className="mt-2">
                              <span className="font-bold text-navy-700">
                                ${parseFloat(listing.priceAmount).toFixed(0)}
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
            </div>
          </section>
        ))}

        {/* Cross Links */}
        <section className="py-16 bg-cream-50">
          <div className="mx-auto max-w-7xl px-6">
            <h2
              className="text-2xl font-bold text-navy-700 mb-8"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Explore More in {island.name}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link
                href={`/best-restaurants-${slug}`}
                className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 group"
              >
                <UtensilsCrossed
                  size={24}
                  className="text-gold-500 mb-3"
                />
                <h3 className="font-semibold text-navy-700 group-hover:text-gold-600 transition-colors">
                  Best Restaurants in {island.name}
                </h3>
                <p className="text-sm text-navy-400 mt-1">
                  Top-rated dining experiences
                </p>
              </Link>
              <Link
                href={`/best-hotels-${slug}`}
                className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 group"
              >
                <Home size={24} className="text-gold-500 mb-3" />
                <h3 className="font-semibold text-navy-700 group-hover:text-gold-600 transition-colors">
                  Best Hotels in {island.name}
                </h3>
                <p className="text-sm text-navy-400 mt-1">
                  Top-rated stays and accommodations
                </p>
              </Link>
              <Link
                href={`/trips/new`}
                className="bg-gradient-to-br from-gold-500 to-gold-600 rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 group"
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
              Frequently Asked Questions
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
              Ready to explore {island.name}?
            </h2>
            <p className="mt-4 text-white/70 max-w-xl mx-auto">
              Book directly with verified local operators. Lowest commissions in
              the travel industry — more money stays in {island.name}.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link
                href="/trips/new"
                className="bg-gold-500 hover:bg-gold-600 text-white px-8 py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
              >
                Plan Your Trip <ArrowRight size={16} />
              </Link>
              <Link
                href={`/explore?island=${slug}`}
                className="bg-white/10 text-white border border-white/20 px-8 py-3.5 rounded-xl font-semibold hover:bg-white/20 transition-colors"
              >
                Browse All Listings
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
