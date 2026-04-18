"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  Loader2,
  ArrowRight,
} from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";

type IslandData = {
  name: string;
  slug: string;
  description: string | null;
  counts: Record<string, number>;
  featured: {
    id: string;
    title: string;
    slug: string;
    type: string;
    priceAmount: string | null;
    priceUnit: string | null;
    avgRating: string | null;
    reviewCount: number | null;
    parish: string | null;
    image: string | null;
  }[];
};

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

export default function IslandPage() {
  const params = useParams();
  const islandSlug = params.island as string;
  const [data, setData] = useState<IslandData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIsland() {
      try {
        const res = await fetch(`/api/islands/${islandSlug}`);
        if (!res.ok) throw new Error("Not found");
        const json = await res.json();
        setData(json);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    if (islandSlug) fetchIsland();
  }, [islandSlug]);

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

  if (!data) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 px-6">
          <h1 className="text-2xl font-bold text-navy-700">Island not found</h1>
          <Link href="/explore" className="mt-6 bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold">
            Back to Explore
          </Link>
        </div>
      </>
    );
  }

  const totalListings = Object.values(data.counts).reduce((a, b) => a + b, 0);
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
              { label: `${getIslandFlag(islandSlug)} ${data.name}` },
            ]}
          />
        </div>

        {/* Hero */}
        <section className="relative h-[400px] md:h-[500px] flex items-end overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImg})` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/30 to-transparent" />
          <div className="relative z-10 mx-auto max-w-7xl px-6 pb-12 w-full">
            <h1 className="text-4xl md:text-6xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
              {getIslandFlag(islandSlug)} {data.name}
            </h1>
            <p className="text-white/70 mt-2 max-w-2xl">{data.description}</p>
            <div className="flex items-center gap-6 mt-4 text-sm text-white/60">
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                Caribbean
              </span>
              <span>{totalListings} listings</span>
            </div>
          </div>
        </section>

        {/* Category Cards */}
        <div className="mx-auto max-w-7xl px-6 -mt-8 relative z-10">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {typeConfig.map((tc) => {
              const count = data.counts[tc.type] || 0;
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
        {data.featured.length > 0 && (
          <div className="mx-auto max-w-7xl px-6 py-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
                Top experiences in {data.name}
              </h2>
              <Link href={`/explore?island=${islandSlug}`} className="text-gold-700 font-semibold text-sm flex items-center gap-1 hover:text-gold-600">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {data.featured.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/${islandSlug}/${listing.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="relative h-44 overflow-hidden">
                    {listing.image ? (
                      <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110" style={{ backgroundImage: `url(${listing.image})` }} />
                    ) : (
                      <div className="absolute inset-0 bg-cream-200" />
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-navy-400">{listing.parish || data.name}</p>
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
                          <Star size={12} className="text-gold-500 fill-gold-500" />
                          <span className="text-xs font-semibold">{parseFloat(listing.avgRating).toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
