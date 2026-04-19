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
} from "@/server/seo-queries";
import { getImageUrl } from "@/lib/image-utils";
import { FeaturedListingsClient } from "./featured-listings-client";

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
};
const defaultHero = "/images/hero/caribbean-hero.jpg";

type Props = { params: Promise<{ island: string }> };

export default async function IslandPage({ params }: Props) {
  const { island: islandSlug } = await params;
  // Layout already validated this slug; the cache() wrapper makes this
  // a no-op DB-wise.
  const island = await getIslandBySlug(islandSlug);
  if (!island) notFound();

  const [stats, featured] = await Promise.all([
    getIslandStats(island.id),
    getTopListingsForIsland(island.id, 8),
  ]);

  const heroImg = heroImages[islandSlug] || defaultHero;

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
            <div className="flex items-center gap-6 mt-4 text-sm text-white/60">
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                Caribbean
              </span>
              <span>{stats.totalListings} listings</span>
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
      </main>
      <Footer />
    </>
  );
}
