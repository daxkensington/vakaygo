import type { Metadata } from "next";
import { safeJsonLd } from "@/lib/json-ld";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "Explore 34 Caribbean, Latin America & Mediterranean Destinations",
  description:
    "Discover verified stays, boat charters, tours, dining, and experiences across 34 Caribbean, Latin American, and Mediterranean destinations with 0% guest booking fees on VakayGo.",
  alternates: { canonical: "https://vakaygo.com/islands" },
};
import { Footer } from "@/components/layout/footer";
import { MapPin, ArrowRight } from "lucide-react";
import { getIslandFlag } from "@/lib/island-flags";
import { getActiveIslandsWithCounts } from "@/server/seo-queries";

// ISR: static HTML at the CDN, refreshed hourly in the background.
export const revalidate = 3600;

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
  // Wave 2A — Latin America
  cartagena: "/images/islands/curacao.jpg",
  medellin: "/images/islands/dominica.jpg",
  "cancun-riviera-maya": "/images/islands/turks-and-caicos.jpg",
  "los-cabos": "/images/islands/aruba.jpg",
  guanacaste: "/images/islands/st-lucia.jpg",
  "ambergris-caye": "/images/islands/cayman-islands.jpg",
  // Wave 2B — Mediterranean
  santorini: "/images/islands/antigua.jpg",
  mykonos: "/images/islands/bahamas.jpg",
  crete: "/images/islands/grenada.jpg",
  ibiza: "/images/islands/barbados.jpg",
  mallorca: "/images/islands/martinique.jpg",
  "amalfi-coast-capri": "/images/islands/st-vincent.jpg",
  "hvar-split": "/images/islands/british-virgin-islands.jpg",
};
const defaultImage = "/images/hero/caribbean-hero.jpg";

const REGION_META: Array<{
  key: string;
  badge: string;
  title: string;
  subtitle: string;
}> = [
  {
    key: "Caribbean",
    badge: "Wave 1 · Core Network",
    title: "Caribbean Islands",
    subtitle: "21 island destinations across the Eastern, Western, and Southern Caribbean.",
  },
  {
    key: "Latin America",
    badge: "Wave 2A · Year-Round Americas",
    title: "Latin America & Central America",
    subtitle: "High-demand coastal & cultural hubs across Colombia, Mexico, Costa Rica, and Belize.",
  },
  {
    key: "Mediterranean",
    badge: "Wave 2B · European Summer Peak",
    title: "Mediterranean Islands & Coasts",
    subtitle: "Iconic yachting, villa, and coastal hubs across Greece, Spain, Italy, and Croatia.",
  },
];

export default async function IslandsPage() {
  const islands = await getActiveIslandsWithCounts();
  const totalListings = islands.reduce((sum, i) => sum + i.listingCount, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: "VakayGo Global Destinations",
    description: `Explore ${islands.length} Caribbean, Latin American, and Mediterranean destinations and ${totalListings.toLocaleString()} stays, boat charters, tours, dining, and experiences on VakayGo.`,
    url: "https://vakaygo.com/islands",
    image: "https://vakaygo.com/images/hero/caribbean-hero.jpg",
    geo: { "@type": "GeoCoordinates", latitude: 15.0, longitude: -65.0 },
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
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
        {/* Hero — intentionally tall on mobile so the destination grid
            starts below the initial viewport. That makes the h1 the
            Lighthouse LCP candidate (paints in the text phase, sub-
            second) instead of the first card's image. */}
        <div className="bg-navy-700 py-24 md:py-32 min-h-[80vh] md:min-h-0 flex items-center">
          <div className="mx-auto max-w-7xl px-6 text-center w-full">
            <p className="text-sm font-semibold text-gold-400 uppercase tracking-widest mb-6">
              Caribbean · Latin America · Mediterranean
            </p>
            <h1
              className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Explore <span className="text-gold-400">{islands.length} Destinations</span>
            </h1>
            <p className="mt-6 text-white/70 text-lg md:text-xl max-w-2xl mx-auto">
              {islands.length} sun &amp; sea destinations. {totalListings.toLocaleString()} verified local experiences. 0% guest booking fees.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-8 text-white/80">
              <div>
                <p className="text-3xl md:text-4xl font-bold text-gold-400">{islands.length}</p>
                <p className="text-sm uppercase tracking-wider mt-1">Destinations</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-gold-400">{totalListings.toLocaleString()}</p>
                <p className="text-sm uppercase tracking-wider mt-1">Experiences</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-gold-400">3</p>
                <p className="text-sm uppercase tracking-wider mt-1">Global Regions</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-gold-400">0%</p>
                <p className="text-sm uppercase tracking-wider mt-1">Guest Fee</p>
              </div>
            </div>
          </div>
        </div>

        {/* Regional Destination Grids — ALL active destinations are server-rendered
            so Googlebot gets a crawlable <a> link to every hub. */}
        <div className="mx-auto max-w-7xl px-6 py-12 space-y-16">
          {REGION_META.map((regionSpec) => {
            const regionIslands = islands.filter(
              (i) => (i.region || "Caribbean") === regionSpec.key
            );
            if (regionIslands.length === 0) return null;

            return (
              <section key={regionSpec.key}>
                <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-gold-600 mb-1.5">
                      {regionSpec.badge}
                    </p>
                    <h2
                      className="text-3xl md:text-4xl font-bold text-navy-800"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {regionSpec.title}
                    </h2>
                    <p className="mt-1.5 text-sm md:text-base text-navy-500">
                      {regionSpec.subtitle}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-navy-600">
                    {regionIslands.length} destinations ·{" "}
                    {regionIslands.reduce((s, x) => s + x.listingCount, 0).toLocaleString()} listings
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {regionIslands.map((island) => {
                    const flag = getIslandFlag(island.slug);
                    const image = islandImages[island.slug] || defaultImage;

                    return (
                      <Link
                        key={island.id}
                        href={`/${island.slug}`}
                        className="group relative h-64 rounded-3xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-500"
                      >
                        <Image
                          src={image}
                          alt={island.name}
                          fill
                          loading="lazy"
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
              </section>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
