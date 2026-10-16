import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";

const islands = [
  { name: "Grenada", slug: "grenada", flag: "🇬🇩", count: 468, tagline: "Spice Isle, Grand Anse & waterfalls" },
  { name: "Dominican Republic", slug: "dominican-republic", flag: "🇩🇴", count: 414, tagline: "Punta Cana beaches, Samaná & Zona Colonial" },
  { name: "Puerto Rico", slug: "puerto-rico", flag: "🇵🇷", count: 403, tagline: "Old San Juan, El Yunque rainforest & biobays" },
  { name: "Jamaica", slug: "jamaica", flag: "🇯🇲", count: 394, tagline: "Negril cliffs, Montego Bay & Blue Mountains" },
  { name: "St. Lucia", slug: "st-lucia", flag: "🇱🇨", count: 366, tagline: "Iconic Pitons, volcanic mud baths & catamarans" },
  { name: "Guadeloupe", slug: "guadeloupe", flag: "🇬🇵", count: 366, tagline: "French-Creole cuisine, volcano hikes & lagoons" },
  { name: "Bahamas", slug: "bahamas", flag: "🇧🇸", count: 357, tagline: "Exuma cays, pink sand beaches & reef diving" },
  { name: "US Virgin Islands", slug: "us-virgin-islands", flag: "🇻🇮", count: 350, tagline: "Trunk Bay, St. John national park & sailing" },
  { name: "Martinique", slug: "martinique", flag: "🇲🇶", count: 349, tagline: "Mount Pelée, rum distilleries & bays" },
  { name: "Trinidad & Tobago", slug: "trinidad-and-tobago", flag: "🇹🇹", count: 346, tagline: "Pigeon Point, Nylon Pool & vibrant culture" },
  { name: "Aruba", slug: "aruba", flag: "🇦🇼", count: 335, tagline: "Eagle Beach, Arikok desert trails & wrecks" },
  { name: "Barbados", slug: "barbados", flag: "🇧🇧", count: 334, tagline: "Platinum West Coast, Oistins & rum heritage" },
  { name: "Curaçao", slug: "curacao", flag: "🇨🇼", count: 319, tagline: "Willemstad harbor, Klein Curaçao & coves" },
  { name: "Antigua & Barbuda", slug: "antigua", flag: "🇦🇬", count: 302, tagline: "365 beaches, Nelson's Dockyard &Shirley Heights" },
  { name: "Turks & Caicos", slug: "turks-and-caicos", flag: "🇹🇨", count: 287, tagline: "Grace Bay powder sands & barrier reef" },
  { name: "Bonaire", slug: "bonaire", flag: "🏝️", count: 282, tagline: "Shore diving capital, salt flats & windsurfing" },
  { name: "Cayman Islands", slug: "cayman-islands", flag: "🇰🇾", count: 279, tagline: "Seven Mile Beach, Stingray City & caves" },
  { name: "St. Vincent", slug: "st-vincent", flag: "🇻🇨", count: 262, tagline: "Bequia, Tobago Cays marine park & falls" },
  { name: "St. Kitts & Nevis", slug: "st-kitts", flag: "🇰🇳", count: 258, tagline: "Brimstone Hill fortress & Nevis Peak" },
  { name: "Dominica", slug: "dominica", flag: "🇩🇲", count: 228, tagline: "Boiling Lake, Trafalgar Falls & whale watching" },
  { name: "BVI", slug: "british-virgin-islands", flag: "🇻🇬", count: 218, tagline: "The Baths at Virgin Gorda & Jost Van Dyke" },
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
                <div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/35 to-transparent" />
                <div className="absolute inset-0 bg-navy-900/10 group-hover:bg-navy-900/0 transition-colors duration-500" />

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-6 pr-16">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{island.flag}</span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-white truncate">
                        {island.name}
                      </h3>
                      <p className="text-white/75 text-xs line-clamp-1 mt-0.5">
                        {island.tagline}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Island count badge */}
                <div className="absolute top-4 right-4">
                  <span className="bg-navy-900/70 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20 flex items-center gap-1">
                    <MapPin size={11} className="text-gold-400" />
                    {island.count} places
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
