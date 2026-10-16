import Link from "next/link";

const islands = [
  { name: "Grenada", flag: "🇬🇩", slug: "grenada", tagline: "Isle of Spice", status: "Live now", active: true },
  { name: "Trinidad & Tobago", flag: "🇹🇹", slug: "trinidad-and-tobago", tagline: "Carnival Capital", status: "Live now", active: true },
  { name: "Barbados", flag: "🇧🇧", slug: "barbados", tagline: "Gem of the Caribbean", status: "Live now", active: true },
  { name: "St. Lucia", flag: "🇱🇨", slug: "st-lucia", tagline: "The Pitons Await", status: "Live now", active: true },
  { name: "Jamaica", flag: "🇯🇲", slug: "jamaica", tagline: "One Love", status: "Live now", active: true },
  { name: "Bahamas", flag: "🇧🇸", slug: "bahamas", tagline: "It's Better Here", status: "Live now", active: true },
  { name: "Antigua", flag: "🇦🇬", slug: "antigua", tagline: "Beach for Every Day", status: "Live now", active: true },
  { name: "Aruba", flag: "🇦🇼", slug: "aruba", tagline: "One Happy Island", status: "Live now", active: true },
  { name: "Dominican Republic", flag: "🇩🇴", slug: "dominican-republic", tagline: "Has It All", status: "Live now", active: true },
  { name: "Puerto Rico", flag: "🇵🇷", slug: "puerto-rico", tagline: "Isla del Encanto", status: "Live now", active: true },
  { name: "Curaçao", flag: "🇨🇼", slug: "curacao", tagline: "Colorful Capital", status: "Live now", active: true },
  { name: "St. Vincent", flag: "🇻🇨", slug: "st-vincent", tagline: "Grenadine Paradise", status: "Live now", active: true },
  { name: "Cayman Islands", flag: "🇰🇾", slug: "cayman-islands", tagline: "Beyond Extraordinary", status: "Live now", active: true },
  { name: "USVI", flag: "🇻🇮", slug: "us-virgin-islands", tagline: "American Paradise", status: "Live now", active: true },
  { name: "BVI", flag: "🇻🇬", slug: "british-virgin-islands", tagline: "Nature's Little Secrets", status: "Live now", active: true },
  { name: "Dominica", flag: "🇩🇲", slug: "dominica", tagline: "Nature Isle", status: "Live now", active: true },
  { name: "St. Kitts", flag: "🇰🇳", slug: "st-kitts", tagline: "Sugar City", status: "Live now", active: true },
  { name: "Turks & Caicos", flag: "🇹🇨", slug: "turks-and-caicos", tagline: "Beautiful by Nature", status: "Live now", active: true },
  { name: "Martinique", flag: "🇲🇶", slug: "martinique", tagline: "Île aux Fleurs", status: "Live now", active: true },
  { name: "Guadeloupe", flag: "🇬🇵", slug: "guadeloupe", tagline: "Butterfly Island", status: "Live now", active: true },
  { name: "Bonaire", flag: "🇧🇶", slug: "bonaire", tagline: "Diver's Paradise", status: "Live now", active: true },
  { name: "Cartagena", flag: "🇨🇴", slug: "cartagena", tagline: "Walled City Magic", status: "Live now", active: true },
  { name: "Medellín", flag: "🇨🇴", slug: "medellin", tagline: "Eternal Spring", status: "Live now", active: true },
  { name: "Cancún & Riviera Maya", flag: "🇲🇽", slug: "cancun-riviera-maya", tagline: "Cenotes & Coast", status: "Live now", active: true },
  { name: "Los Cabos", flag: "🇲🇽", slug: "los-cabos", tagline: "Sea of Cortez", status: "Live now", active: true },
  { name: "Guanacaste", flag: "🇨🇷", slug: "guanacaste", tagline: "Pura Vida Coast", status: "Live now", active: true },
  { name: "Ambergris Caye", flag: "🇧🇿", slug: "ambergris-caye", tagline: "Barrier Reef Hub", status: "Live now", active: true },
  { name: "Santorini", flag: "🇬🇷", slug: "santorini", tagline: "Aegean Caldera", status: "Live now", active: true },
  { name: "Mykonos", flag: "🇬🇷", slug: "mykonos", tagline: "Cycladic Luxury", status: "Live now", active: true },
  { name: "Crete", flag: "🇬🇷", slug: "crete", tagline: "Lagoon & History", status: "Live now", active: true },
  { name: "Ibiza", flag: "🇪🇸", slug: "ibiza", tagline: "Balearic Escape", status: "Live now", active: true },
  { name: "Mallorca", flag: "🇪🇸", slug: "mallorca", tagline: "Tramuntana & Coves", status: "Live now", active: true },
  { name: "Amalfi & Capri", flag: "🇮🇹", slug: "amalfi-coast-capri", tagline: "La Dolce Vita", status: "Live now", active: true },
  { name: "Hvar & Split", flag: "🇭🇷", slug: "hvar-split", tagline: "Dalmatian Coast", status: "Live now", active: true },
  { name: "More Destinations", flag: "🌊", slug: "", tagline: "Expanding globally", status: "Request yours", active: false },
];

export function Roadmap() {
  return (
    <section className="py-24 md:py-32 bg-cream-50 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-gold-700 uppercase tracking-widest mb-4">
            Global Sun &amp; Sea Network
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            34 destinations.{" "}
            <span className="text-teal-500">One platform.</span>
          </h2>
          <p className="mt-4 text-navy-400 max-w-lg mx-auto text-lg">
            From the Caribbean to Latin America &amp; the Mediterranean — discover
            8,000+ local businesses on VakayGo.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
          {islands.map((island, i) => {
            const content = (
              <div
                className={`relative rounded-2xl p-4 text-center transition-all duration-500 hover:-translate-y-1 cursor-pointer ${
                  island.active
                    ? "bg-white text-navy-600 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]"
                    : "bg-cream-100 text-navy-400"
                }`}
                style={{ transitionDelay: `${i * 30}ms` }}
              >
                <span className="text-2xl block">{island.flag}</span>
                <p className="font-bold mt-2 text-xs leading-tight">
                  {island.name}
                </p>
                <p className="text-[10px] mt-0.5 text-navy-500">
                  {island.tagline}
                </p>
              </div>
            );

            return island.slug ? (
              <Link key={island.name} href={`/explore?island=${island.slug}`}>
                {content}
              </Link>
            ) : (
              <div key={island.name}>{content}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
