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
  { name: "More Islands", flag: "🌊", slug: "", tagline: "Expanding globally", status: "Request yours", active: false },
];

export function Roadmap() {
  return (
    <section className="py-24 md:py-32 bg-cream-50 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">
            Caribbean-Wide
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold text-navy-700 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            21 islands.{" "}
            <span className="text-teal-500">One platform.</span>
          </h2>
          <p className="mt-4 text-navy-400 max-w-lg mx-auto text-lg">
            From Grenada to Puerto Rico — discover the entire Caribbean on
            VakayGo.
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
                <h4 className="font-bold mt-2 text-xs leading-tight">
                  {island.name}
                </h4>
                <p className="text-[10px] mt-0.5 opacity-60">
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
