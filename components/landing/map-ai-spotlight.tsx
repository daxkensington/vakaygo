import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const tools = [
  {
    title: "Explore the 3D map",
    description: "Browse local places across 34 destinations, filter by category, and explore the coast in 3D.",
    href: "/map",
    cta: "Launch 3D Map",
    image: "/images/sections/map-showcase.jpg",
  },
  {
    title: "Build an AI itinerary",
    description: "Choose your dates, pace, and budget for a day-by-day plan using places in the directory. Check details and availability before traveling.",
    href: "/trips/new",
    cta: "Build My AI Itinerary",
    image: "/images/sections/value-explore.jpg",
  },
];

export function MapAiSpotlight() {
  return (
    <section className="bg-navy-900 py-12 md:py-16" aria-labelledby="planning-tools-title">
      <div className="mx-auto max-w-7xl px-6">
        <h2 id="planning-tools-title" className="text-3xl md:text-4xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Two ways to plan your trip
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {tools.map((tool) => (
            <article key={tool.href} className="overflow-hidden rounded-2xl border border-white/15 bg-white/5">
              <div className="relative h-32 md:h-44">
                <Image src={tool.image} alt="" fill loading="lazy" sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw" quality={75} className="object-cover" />
              </div>
              <div className="p-5 md:p-6">
                <h3 className="text-xl font-bold text-white">{tool.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{tool.description}</p>
                <Link href={tool.href} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 font-semibold text-navy-900 hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300">
                  {tool.cta}<ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
