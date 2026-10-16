import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  Home,
  Compass,
  UtensilsCrossed,
  Music,
  Car,
  Users,
  Sparkles,
  Star,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";
import {
  getIslandBySlug,
  getIslandStats,
  getTopListingsForIsland,
  getAllListingSlugsForIsland,
} from "@/server/seo-queries";
import { getImageUrl } from "@/lib/image-utils";
import { FeaturedListingsClient } from "./featured-listings-client";

// ISR: static HTML at the CDN, refreshed hourly in the background.
export const revalidate = 3600;
// No build-time enumeration (7k listings / DB fan-out): every path renders
// on first request and is then served from the cache until revalidated.
export async function generateStaticParams() {
  return [];
}

const typeConfig = [
  { type: "stay", label: "Stays", icon: Home, color: "bg-gold-500" },
  { type: "excursion", label: "Excursions", icon: Compass, color: "bg-teal-500" },
  { type: "tour", label: "Tours", icon: Compass, color: "bg-teal-600" },
  { type: "dining", label: "Dining", icon: UtensilsCrossed, color: "bg-gold-600" },
  { type: "event", label: "Events", icon: Music, color: "bg-teal-600" },
  { type: "transfer", label: "Transfers", icon: Car, color: "bg-navy-500" },
  { type: "transport", label: "Transport", icon: Car, color: "bg-navy-600" },
  { type: "vip", label: "VIP", icon: Users, color: "bg-gold-600" },
  { type: "guide", label: "Guides", icon: Users, color: "bg-gold-500" },
  { type: "spa", label: "Spa & Wellness", icon: Sparkles, color: "bg-pink-500" },
];

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
  "st-vincent": "/images/islands/st-vincent.jpg",
  dominica: "/images/islands/dominica.jpg",
  "turks-and-caicos": "/images/islands/turks-and-caicos.jpg",
  "cayman-islands": "/images/islands/cayman-islands.jpg",
  bonaire: "/images/islands/bonaire.jpg",
  "st-kitts": "/images/islands/st-kitts.jpg",
  martinique: "/images/islands/martinique.jpg",
  guadeloupe: "/images/islands/guadeloupe.jpg",
  "us-virgin-islands": "/images/islands/us-virgin-islands.jpg",
  "british-virgin-islands": "/images/islands/british-virgin-islands.jpg",
  "puerto-rico": "/images/islands/puerto-rico.jpg",
};
const defaultHero = "/images/hero/caribbean-hero.jpg";

const islandEssentials: Record<
  string,
  { currency: string; language: string; bestTime: string; airport: string; driving: string }
> = {
  grenada: { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – May", airport: "GND (Maurice Bishop)", driving: "Left side" },
  barbados: { currency: "BDS$ (BBD) / USD", language: "English", bestTime: "Dec – Apr", airport: "BGI (Grantley Adams)", driving: "Left side" },
  jamaica: { currency: "J$ (JMD) / USD", language: "English / Patois", bestTime: "Nov – Apr", airport: "MBJ / KIN", driving: "Left side" },
  "st-lucia": { currency: "EC$ (XCD) / USD", language: "English / Kwéyòl", bestTime: "Dec – May", airport: "UVF (Hewanorra)", driving: "Left side" },
  "trinidad-and-tobago": { currency: "TT$ (TTD) / USD", language: "English", bestTime: "Jan – May", airport: "POS / TAB", driving: "Left side" },
  bahamas: { currency: "B$ (BSD) / USD", language: "English", bestTime: "Nov – Apr", airport: "NAS (Lynden Pindling)", driving: "Left side" },
  antigua: { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – Apr", airport: "ANU (V.C. Bird)", driving: "Left side" },
  aruba: { currency: "AWG / USD", language: "Dutch / Papiamento / EN", bestTime: "Year-round", airport: "AUA (Queen Beatrix)", driving: "Right side" },
  curacao: { currency: "ANG / USD", language: "Dutch / Papiamento / EN", bestTime: "Year-round", airport: "CUR (Hato Intl)", driving: "Right side" },
  "dominican-republic": { currency: "RD$ (DOP) / USD", language: "Spanish / English", bestTime: "Dec – Apr", airport: "PUJ / SDQ", driving: "Right side" },
  "turks-and-caicos": { currency: "USD ($)", language: "English", bestTime: "Dec – May", airport: "PLS (Providenciales)", driving: "Left side" },
  "cayman-islands": { currency: "CI$ (KYD) / USD", language: "English", bestTime: "Nov – Apr", airport: "GCM (Owen Roberts)", driving: "Left side" },
  "puerto-rico": { currency: "USD ($)", language: "Spanish / English", bestTime: "Dec – Apr", airport: "SJU (Luis Muñoz Marín)", driving: "Right side" },
  guadeloupe: { currency: "EUR (€)", language: "French / Creole", bestTime: "Dec – May", airport: "PTP (Pointe-à-Pitre)", driving: "Right side" },
  martinique: { currency: "EUR (€)", language: "French / Creole", bestTime: "Dec – May", airport: "FDF (Aimé Césaire)", driving: "Right side" },
  "us-virgin-islands": { currency: "USD ($)", language: "English", bestTime: "Dec – May", airport: "STT (Cyril E. King)", driving: "Left side" },
  "british-virgin-islands": { currency: "USD ($)", language: "English", bestTime: "Dec – May", airport: "EIS (Terrance B. Lettsome)", driving: "Left side" },
  bonaire: { currency: "USD ($)", language: "Dutch / Papiamentu / EN", bestTime: "Year-round", airport: "BON (Flamingo Intl)", driving: "Right side" },
  "st-vincent": { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – May", airport: "SVD (Argyle Intl)", driving: "Left side" },
  "st-kitts": { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – May", airport: "SKB (Robert L. Bradshaw)", driving: "Left side" },
  dominica: { currency: "EC$ (XCD) / USD", language: "English / Kwéyòl", bestTime: "Dec – May", airport: "DOM (Douglas-Charles)", driving: "Left side" },
};
const defaultEssentials = {
  currency: "USD & Local Currency",
  language: "English / Local",
  bestTime: "Dec – May",
  airport: "International Airport",
  driving: "Local permit / Check side",
};

type Props = { params: Promise<{ island: string }> };

export default async function IslandPage({ params }: Props) {
  const { island: islandSlug } = await params;
  // Layout already validated this slug; the cache() wrapper makes this
  // a no-op DB-wise.
  const island = await getIslandBySlug(islandSlug);
  if (!island) notFound();

  const [stats, featured, allListings] = await Promise.all([
    getIslandStats(island.id),
    getTopListingsForIsland(island.id, 8),
    getAllListingSlugsForIsland(island.id),
  ]);

  const heroImg = heroImages[islandSlug] || defaultHero;
  const essentials = islandEssentials[islandSlug] || defaultEssentials;

  return (
    <>
      <Header />
      <main className="bg-cream-50 min-h-screen">
        {/* Breadcrumbs */}
        <div className="mx-auto max-w-7xl px-6 pt-24 pb-2">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Islands", href: "/explore" },
              { label: `${getIslandFlag(islandSlug)} ${island.name}` },
            ]}
          />
        </div>

        {/* Hero — image is desktop-only. On mobile it was the LCP
            candidate at 3-5 s element-render-delay even with priority
            + preload (Lighthouse brutalizes mobile paint budgets).
            Swapping to a solid navy/gold gradient on mobile makes
            the h1 the LCP, which paints in the text phase. Desktop
            perf is already green so it keeps the photo. */}
        <section className="relative h-[400px] md:h-[500px] flex items-end overflow-hidden bg-gradient-to-br from-navy-800 via-navy-700 to-gold-900/40 md:bg-none">
          <Image
            src={heroImg}
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            quality={80}
            className="hidden md:block object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/30 to-transparent" />
          <div className="relative z-10 mx-auto max-w-7xl px-6 pb-12 w-full">
            <h1 className="text-4xl md:text-6xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
              {getIslandFlag(islandSlug)} {island.name}
            </h1>
            <p className="text-white/70 mt-2 max-w-2xl">{island.description}</p>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-white/80">
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                Caribbean
              </span>
              <span>{stats.totalListings} verified places</span>
              <Link
                href={`/trips/new?island=${islandSlug}`}
                className="inline-flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full shadow-md transition-colors"
              >
                <Sparkles size={13} />
                Plan a {island.name} Trip with AI
              </Link>
              <Link
                href="/map"
                className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-md text-white text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/25 transition-colors"
              >
                <Compass size={13} />
                Explore on 3D Map
              </Link>
            </div>
          </div>
        </section>

        {/* Category Cards */}
        <div className="mx-auto max-w-7xl px-6 -mt-8 relative z-10 defer-offscreen">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {typeConfig.map((tc) => {
              const count = stats.typeCounts[tc.type] || 0;
              return (
                <Link
                  key={tc.type}
                  href={`/explore?island=${islandSlug}&type=${tc.type}`}
                  className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 text-center"
                >
                  <div className={`w-10 h-10 ${tc.color} rounded-xl flex items-center justify-center mx-auto`}>
                    <tc.icon size={20} className="text-white" />
                  </div>
                  <p className="font-semibold text-navy-700 text-sm mt-2">{tc.label}</p>
                  <p className="text-xs text-navy-400">{count}</p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Island Essentials At-a-Glance Bar + 3D Map & AI Trip Planner Banner */}
        <section className="mx-auto max-w-7xl px-6 pt-8 pb-2">
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Currency</p>
                <p className="text-sm font-semibold text-navy-700 mt-0.5">💱 {essentials.currency}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Language</p>
                <p className="text-sm font-semibold text-navy-700 mt-0.5">🗣️ {essentials.language}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Best Time to Visit</p>
                <p className="text-sm font-semibold text-navy-700 mt-0.5">☀️ {essentials.bestTime}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Main Airport</p>
                <p className="text-sm font-semibold text-navy-700 mt-0.5">✈️ {essentials.airport}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Driving</p>
                <p className="text-sm font-semibold text-navy-700 mt-0.5">🚗 {essentials.driving}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Listings — client-mounted after requestIdleCallback
            so the 8 external listing thumbnails (often 500 KB+ each
            from random business CDNs) stay out of the LCP window. */}
        {featured.length > 0 && (
          <div className="mx-auto max-w-7xl px-6 py-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
                Top experiences in {island.name}
              </h2>
              <Link href={`/explore?island=${islandSlug}`} className="text-gold-700 font-semibold text-sm flex items-center gap-1 hover:text-gold-600">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <FeaturedListingsClient
              islandSlug={islandSlug}
              islandName={island.name}
              listings={featured.map((l) => ({
                id: l.id,
                slug: l.slug,
                title: l.title,
                image: l.image,
                parish: l.parish,
                priceAmount: l.priceAmount,
                priceUnit: l.priceUnit,
                avgRating: l.avgRating,
              }))}
            />
          </div>
        )}

        {/* Browse-all crawl index — server-rendered links to EVERY listing on
            the island. This is the discovery path that makes each listing
            reachable in 2 clicks from the homepage (homepage → hub → listing),
            so Googlebot can actually crawl the deep pages instead of treating
            them as sitemap-only orphans. */}
        {allListings.length > 0 && (
          <section className="mx-auto max-w-7xl px-6 pb-16">
            <h2
              className="text-xl font-bold text-navy-700 mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Browse all {stats.totalListings} experiences in {island.name}
            </h2>
            <ul className="columns-1 sm:columns-2 lg:columns-3 gap-x-8 text-sm">
              {allListings.map((l) => (
                <li key={l.slug} className="mb-1.5 break-inside-avoid">
                  <Link
                    href={`/${islandSlug}/${l.slug}`}
                    className="text-navy-500 hover:text-gold-700 transition-colors"
                  >
                    {l.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
