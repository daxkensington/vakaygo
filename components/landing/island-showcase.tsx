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
  { name: "Antigua & Barbuda", slug: "antigua", flag: "🇦🇬", count: 302, tagline: "365 beaches, Nelson's Dockyard & Shirley Heights" },
  { name: "Turks & Caicos", slug: "turks-and-caicos", flag: "🇹🇨", count: 287, tagline: "Grace Bay powder sands & barrier reef" },
  { name: "Bonaire", slug: "bonaire", flag: "🇧🇶", count: 282, tagline: "Shore diving capital, salt flats & windsurfing" },
  { name: "Cayman Islands", slug: "cayman-islands", flag: "🇰🇾", count: 279, tagline: "Seven Mile Beach, Stingray City & caves" },
  { name: "St. Vincent", slug: "st-vincent", flag: "🇻🇨", count: 262, tagline: "Bequia, Tobago Cays marine park & falls" },
  { name: "St. Kitts & Nevis", slug: "st-kitts", flag: "🇰🇳", count: 258, tagline: "Brimstone Hill fortress & Nevis Peak" },
  { name: "Dominica", slug: "dominica", flag: "🇩🇲", count: 228, tagline: "Boiling Lake, Trafalgar Falls & whale watching" },
  { name: "BVI", slug: "british-virgin-islands", flag: "🇻🇬", count: 218, tagline: "The Baths at Virgin Gorda & Jost Van Dyke" },
  // Wave 2A — Latin America
  { name: "Cancún & Riviera Maya", slug: "cancun-riviera-maya", flag: "🇲🇽", count: 91, tagline: "Tulum cenotes, Mayan ruins & catamaran cruises" },
  { name: "Ambergris Caye", slug: "ambergris-caye", flag: "🇧🇿", count: 91, tagline: "Belize Barrier Reef, Great Blue Hole & charters" },
  { name: "Los Cabos", slug: "los-cabos", flag: "🇲🇽", count: 90, tagline: "El Arco, Sea of Cortez yachts & desert escapes" },
  { name: "Guanacaste", slug: "guanacaste", flag: "🇨🇷", count: 87, tagline: "Papagayo bays, surf charters & eco-lodges" },
  { name: "Medellín & Guatapé", slug: "medellin", flag: "🇨🇴", count: 80, tagline: "Eternal spring valleys, coffee fincas & lake stays" },
  { name: "Cartagena", slug: "cartagena", flag: "🇨🇴", count: 78, tagline: "Walled city villas & Rosario Islands yachts" },
  // Wave 2B — Mediterranean
  { name: "Mykonos", slug: "mykonos", flag: "🇬🇷", count: 94, tagline: "Cycladic villas, Delos sails & beach clubs" },
  { name: "Crete", slug: "crete", flag: "🇬🇷", count: 94, tagline: "Balos lagoon, Samaria Gorge & Venetian harbors" },
  { name: "Santorini", slug: "santorini", flag: "🇬🇷", count: 93, tagline: "Caldera sunset catamarans & Oia cave suites" },
  { name: "Ibiza & Formentera", slug: "ibiza", flag: "🇪🇸", count: 90, tagline: "Formentera boat charters, fincas & coves" },
  { name: "Mallorca", slug: "mallorca", flag: "🇪🇸", count: 83, tagline: "Tramuntana coast, Palma bay sails & calas" },
  { name: "Amalfi Coast & Capri", slug: "amalfi-coast-capri", flag: "🇮🇹", count: 81, tagline: "Positano cliffs, Capri Riva boats & lemon groves" },
  { name: "Hvar & Split", slug: "hvar-split", flag: "🇭🇷", count: 78, tagline: "Dalmatian island hopping, Blue Cave & stone villas" },
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
  cartagena: "/images/islands/cartagena.jpg",
  medellin: "/images/islands/medellin.jpg",
  "cancun-riviera-maya": "/images/islands/cancun-riviera-maya.jpg",
  "los-cabos": "/images/islands/los-cabos.jpg",
  guanacaste: "/images/islands/guanacaste.jpg",
  "ambergris-caye": "/images/islands/ambergris-caye.jpg",
  santorini: "/images/islands/santorini.jpg",
  mykonos: "/images/islands/mykonos.jpg",
  crete: "/images/islands/crete.jpg",
  ibiza: "/images/islands/ibiza.jpg",
  mallorca: "/images/islands/mallorca.jpg",
  "amalfi-coast-capri": "/images/islands/amalfi-coast-capri.jpg",
  "hvar-split": "/images/islands/hvar-split.jpg",
};

const defaultImage = "/images/hero/caribbean-hero.jpg";

const featuredSlugs = new Set([
  "grenada",
  "st-lucia",
  "barbados",
  "cartagena",
  "santorini",
  "amalfi-coast-capri",
]);

export function IslandShowcase() {
  const featuredIslands = islands.filter((island) => featuredSlugs.has(island.slug));
  const moreIslands = islands.filter((island) => !featuredSlugs.has(island.slug));

  return (
    <section id="destinations" className="scroll-mt-28 bg-white py-10 md:py-14">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-6 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold-700">
            Caribbean · Latin America · Mediterranean
          </p>
          <h2
            className="text-2xl font-bold tracking-tight text-navy-700 md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Explore 34 destinations
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-navy-400">
            From Grenada and St. Lucia to Cartagena, Cancún, Santorini, and the Amalfi Coast — discover local stays, charters, and experiences.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {featuredIslands.map((island) => {
            const image = islandImages[island.slug] || defaultImage;

            return (
              <Link
                key={island.slug}
                href={`/${island.slug}`}
                prefetch={false}
                className="group rounded-2xl border border-cream-200 bg-white transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-offset-2"
              >
                <div className="relative h-20 overflow-hidden rounded-t-2xl md:h-28">
                  <Image
                    src={image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(min-width: 1280px) 400px, (min-width: 768px) 33vw, 50vw"
                    quality={75}
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold leading-5 text-navy-700">
                    <span aria-hidden="true">{island.flag}</span>{" "}{island.name}
                  </h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-navy-500">
                    <MapPin size={12} aria-hidden="true" />
                    {island.count} places
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        <details className="mt-5 rounded-2xl border border-cream-200 bg-cream-50">
          <summary className="cursor-pointer rounded-2xl px-4 py-4 text-sm font-semibold text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-offset-2">
            Show {moreIslands.length} more destinations
          </summary>
          <div className="grid grid-cols-1 gap-1 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
            {moreIslands.map((island) => (
              <Link
                key={island.slug}
                href={`/${island.slug}`}
                prefetch={false}
                className="rounded-lg px-3 py-3 text-sm font-medium text-navy-600 transition-colors hover:bg-white hover:text-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700"
              >
                <span aria-hidden="true">{island.flag}</span>{" "}{island.name}
              </Link>
            ))}
          </div>
        </details>

        <div className="mt-5 text-center">
          <Link
            href="/islands"
            prefetch={false}
            className="group inline-flex items-center gap-2 rounded-xl bg-gold-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-offset-2"
          >
            Explore all 34 destinations
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
