"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { MapPin, ArrowRight, Loader2 } from "lucide-react";

type Island = {
  id: number;
  slug: string;
  name: string;
  country: string;
  listingCount: number;
};

const islandFlags: Record<string, string> = {
  grenada: "🇬🇩", "trinidad-and-tobago": "🇹🇹", barbados: "🇧🇧",
  "st-lucia": "🇱🇨", "st-vincent": "🇻🇨", antigua: "🇦🇬",
  dominica: "🇩🇲", jamaica: "🇯🇲", bahamas: "🇧🇸",
  "turks-and-caicos": "🇹🇨", "cayman-islands": "🇰🇾", aruba: "🇦🇼",
  curacao: "🇨🇼", bonaire: "🏝️", "st-kitts": "🇰🇳",
  martinique: "🇲🇶", guadeloupe: "🇬🇵", "us-virgin-islands": "🇻🇮",
  "british-virgin-islands": "🇻🇬", "puerto-rico": "🇵🇷",
  "dominican-republic": "🇩🇴",
};

const islandImages: Record<string, string> = {
  grenada: "https://images.unsplash.com/photo-1580541631950-7282082b02f7?w=600&q=80&auto=format",
  barbados: "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=600&q=80&auto=format",
  jamaica: "https://images.unsplash.com/photo-1562932831-afcfe5b59a20?w=600&q=80&auto=format",
  "st-lucia": "https://images.unsplash.com/photo-1572726729207-a78d6feb18d7?w=600&q=80&auto=format",
  aruba: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80&auto=format",
  bahamas: "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=600&q=80&auto=format",
  "puerto-rico": "https://images.unsplash.com/photo-1580541631950-7282082b02f7?w=600&q=80&auto=format",
};
const defaultImage = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80&auto=format";

export default function IslandsPage() {
  const [islands, setIslands] = useState<Island[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/islands")
      .then((r) => r.json())
      .then((data) => setIslands(data.islands || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalListings = islands.reduce((sum, i) => sum + i.listingCount, 0);

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        {/* Hero */}
        <div className="bg-navy-700 py-16 md:py-24">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <h1
              className="text-4xl md:text-5xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Explore the <span className="text-gold-400">Caribbean</span>
            </h1>
            <p className="mt-4 text-white/60 text-lg max-w-lg mx-auto">
              {islands.length} islands. {totalListings.toLocaleString()} experiences. One platform.
            </p>
          </div>
        </div>

        {/* Island Grid */}
        <div className="mx-auto max-w-7xl px-6 py-12">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-gold-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {islands.map((island) => {
                const flag = islandFlags[island.slug] || "🏝️";
                const image = islandImages[island.slug] || defaultImage;

                return (
                  <Link
                    key={island.id}
                    href={`/${island.slug}`}
                    className="group relative h-64 rounded-3xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-500"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                      style={{ backgroundImage: `url(${image})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/20 to-transparent" />
                    <div className="absolute inset-0 bg-navy-900/10 group-hover:bg-navy-900/0 transition-colors duration-500" />

                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{flag}</span>
                        <div>
                          <h3 className="text-xl font-bold text-white">
                            {island.name}
                          </h3>
                          <p className="text-white/60 text-sm flex items-center gap-1">
                            <MapPin size={12} />
                            {island.listingCount.toLocaleString()} listings
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-6 right-6 w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                      <ArrowRight size={18} className="text-white" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
