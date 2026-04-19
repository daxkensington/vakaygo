import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "Explore 21 Caribbean Islands | VakayGo",
  description:
    "Discover stays, tours, dining, and experiences across 21 Caribbean islands. Compare destinations and plan your trip with VakayGo.",
  alternates: { canonical: "https://vakaygo.com/islands" },
};
import { Footer } from "@/components/layout/footer";
import { MapPin, ArrowRight } from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";
import { getActiveIslandsWithCounts } from "@/server/seo-queries";

const islandImages: Record<string, string> = {
  grenada: "/images/islands/grenada.jpg",
  barbados: "/images/islands/barbados.jpg",
  jamaica: "/images/islands/jamaica.jpg",
  "trinidad-and-tobago": "/images/islands/trinidad.jpg",
  "st-lucia": "/images/islands/st-lucia.jpg",
  aruba: "/images/islands/aruba.jpg",
  bahamas: "/images/islands/bahamas.jpg",
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
const defaultImage = "/images/hero/caribbean-hero.jpg";

// Cards above the fold get eager + high-priority loading; the rest lazy.
// On mobile (1-col) only card 0 is above the fold; priority 3 covers
// the first row at sm (2-col) and the first row at lg (3-col) — but we
// intentionally keep it small so non-LCP cards don't contend for
// bandwidth with the hero/first-card LCP.
const PRIORITY_COUNT = 3;

export default async function IslandsPage() {
  const islands = await getActiveIslandsWithCounts();
  const totalListings = islands.reduce((sum, i) => sum + i.listingCount, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: "Caribbean Islands",
    description: `Explore ${islands.length} Caribbean islands and thousands of stays, tours, dining, and experiences on VakayGo.`,
    url: "https://vakaygo.com/islands",
    image: "https://vakaygo.com/images/hero/caribbean-hero.jpg",
    geo: { "@type": "GeoCoordinates", latitude: 15.0, longitude: -65.0 },
    containedInPlace: { "@type": "Place", name: "Caribbean" },
    includesAttraction: islands.map((island) => ({
      "@type": "TouristDestination",
      name: island.name,
      url: `https://vakaygo.com/${island.slug}`,
    })),
  };

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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

        {/* Island Grid — every row past the first is offscreen at
            first paint. defer-offscreen tells the browser to skip
            layout+paint of each row until the scroll nears it. */}
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {islands.map((island, idx) => {
              const flag = getIslandFlag(island.slug);
              const image = islandImages[island.slug] || defaultImage;
              const isPriority = idx < PRIORITY_COUNT;
              const deferred = idx >= PRIORITY_COUNT;

              return (
                <Link
                  key={island.id}
                  href={`/${island.slug}`}
                  className={`group relative h-64 rounded-3xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-500${deferred ? " defer-offscreen" : ""}`}
                  style={deferred ? { containIntrinsicSize: "1px 256px" } : undefined}
                >
                  <Image
                    src={image}
                    alt={island.name}
                    fill
                    priority={isPriority}
                    fetchPriority={isPriority ? "high" : "auto"}
                    loading={isPriority ? "eager" : "lazy"}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    quality={75}
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/20 to-transparent" />
                  <div className="absolute inset-0 bg-navy-900/10 group-hover:bg-navy-900/0 transition-colors duration-500" />

                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{flag}</span>
                      <div>
                        <h2 className="text-xl font-bold text-white">
                          {island.name}
                        </h2>
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
        </div>
      </main>
      <Footer />
    </>
  );
}
