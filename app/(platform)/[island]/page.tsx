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

        {/* Hero */}
        <section className="relative h-[400px] md:h-[500px] flex items-end overflow-hidden">
          <Image
            src={heroImg}
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            quality={80}
            className="object-cover"
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

        {/* Featured Listings */}
        {featured.length > 0 && (
          <div className="mx-auto max-w-7xl px-6 py-12 defer-offscreen">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
                Top experiences in {island.name}
              </h2>
              <Link href={`/explore?island=${islandSlug}`} className="text-gold-700 font-semibold text-sm flex items-center gap-1 hover:text-gold-600">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featured.map((listing) => {
                const image = getImageUrl(listing.image, { width: 400 });
                return (
                  <Link
                    key={listing.id}
                    href={`/${islandSlug}/${listing.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="relative h-44 overflow-hidden">
                      {image ? (
                        /* Raw <img> — listing images come from arbitrary
                           host names (pulled from business websites), so
                           next/image would need every domain whitelisted
                           in remotePatterns. Not worth the churn for
                           thumbs; they already lazy-load. */
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={image}
                          alt={listing.title}
                          loading="lazy"
                          decoding="async"
                          width={800}
                          height={600}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-cream-200" />
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-navy-400">{listing.parish || island.name}</p>
                      <h3 className="font-semibold text-navy-700 mt-1 line-clamp-1 group-hover:text-gold-600 transition-colors">
                        {listing.title}
                      </h3>
                      <div className="flex items-center justify-between mt-2">
                        {listing.priceAmount && (
                          <span className="font-bold text-navy-700">
                            ${parseFloat(listing.priceAmount).toFixed(0)}
                            <span className="text-navy-400 text-sm font-normal"> / {listing.priceUnit}</span>
                          </span>
                        )}
                        {listing.avgRating && parseFloat(listing.avgRating) > 0 && (
                          <div className="flex items-center gap-1">
                            <Star size={12} className="text-gold-700 fill-gold-500" />
                            <span className="text-xs font-semibold">{parseFloat(listing.avgRating).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
