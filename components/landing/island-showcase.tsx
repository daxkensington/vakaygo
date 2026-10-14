import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";

const islands = [
  { name: "Grenada", slug: "grenada", flag: "🇬🇩" },
  { name: "Puerto Rico", slug: "puerto-rico", flag: "🇵🇷" },
  { name: "Dominican Republic", slug: "dominican-republic", flag: "🇩🇴" },
  { name: "Jamaica", slug: "jamaica", flag: "🇯🇲" },
  { name: "Trinidad & Tobago", slug: "trinidad-and-tobago", flag: "🇹🇹" },
  { name: "Bahamas", slug: "bahamas", flag: "🇧🇸" },
  { name: "Barbados", slug: "barbados", flag: "🇧🇧" },
  { name: "St. Lucia", slug: "st-lucia", flag: "🇱🇨" },
  { name: "Aruba", slug: "aruba", flag: "🇦🇼" },
  { name: "Antigua & Barbuda", slug: "antigua", flag: "🇦🇬" },
  { name: "Curaçao", slug: "curacao", flag: "🇨🇼" },
  { name: "Cayman Islands", slug: "cayman-islands", flag: "🇰🇾" },
  { name: "USVI", slug: "us-virgin-islands", flag: "🇻🇮" },
  { name: "Turks & Caicos", slug: "turks-and-caicos", flag: "🇹🇨" },
  { name: "St. Kitts & Nevis", slug: "st-kitts", flag: "🇰🇳" },
  { name: "Dominica", slug: "dominica", flag: "🇩🇲" },
  { name: "St. Vincent", slug: "st-vincent", flag: "🇻🇨" },
  { name: "Martinique", slug: "martinique", flag: "🇲🇶" },
  { name: "Guadeloupe", slug: "guadeloupe", flag: "🇬🇵" },
  { name: "BVI", slug: "british-virgin-islands", flag: "🇻🇬" },
  { name: "Bonaire", slug: "bonaire", flag: "🏝️" },
];

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

export function IslandShowcase() {
  return (
    <section className="py-24 md:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
            Island Hopping
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Explore 21 Caribbean Islands
          </h2>
          <p className="mt-4 text-navy-400 max-w-lg mx-auto text-lg">
            From Grenada to the Bahamas — discover what each island has to offer.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {islands.map((island) => {
            const image = islandImages[island.slug] || defaultImage;

            return (
              <Link
                key={island.slug}
                href={`/${island.slug}`}
                className="group relative h-64 rounded-3xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-500"
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  loading="lazy"
                  sizes="(min-width: 1280px) 300px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  quality={75}
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 via-navy-900/25 to-transparent" />
                <div className="absolute inset-0 bg-navy-900/10 group-hover:bg-navy-900/0 transition-colors duration-500" />

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{island.flag}</span>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {island.name}
                      </h3>
                      <p className="text-white/60 text-sm flex items-center gap-1">
                        <MapPin size={12} />
                        Discover local listings
                      </p>
                    </div>
                  </div>
                </div>

                {/* Island action */}
                <div className="absolute top-5 right-5">
                  <span className="bg-white/20 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                    Explore island
                  </span>
                </div>

                {/* Explore arrow */}
                <div className="absolute bottom-6 right-6 w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                  <ArrowRight size={18} className="text-white" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* View all link */}
        <div className="text-center mt-12">
          <Link
            href="/islands"
            className="inline-flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] group"
          >
            Explore all islands
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
