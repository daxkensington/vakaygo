import Image from "next/image";
import Link from "next/link";
import { Compass, Sparkles, Play, MapPin, ArrowRight, Layers, Calendar } from "lucide-react";

export function MapAiSpotlight() {
  return (
    <section className="py-20 md:py-28 bg-navy-900 relative overflow-hidden">
      {/* Ambient golden & teal glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-gold-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 bg-gold-500/15 border border-gold-400/30 text-gold-300 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            <Sparkles size={13} />
            Next-Gen Global Sun &amp; Sea Discovery
          </span>
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Fly Over 34 Destinations in 3D.
            <br />
            <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-teal-300 bg-clip-text text-transparent">
              Build Your Itinerary with AI.
            </span>
          </h2>
          <p className="mt-4 text-white/70 text-base md:text-lg leading-relaxed">
            Explore local stays, restaurants, and charters on our interactive 3D satellite map, or use our AI Concierge to help plan a day-by-day coastal itinerary with places from the directory.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card 1: 3D Interactive Caribbean Map */}
          <div className="group relative rounded-3xl overflow-hidden border border-white/15 bg-navy-800/80 shadow-2xl flex flex-col justify-between min-h-[440px]">
            <div className="relative h-60 overflow-hidden">
              <Image
                src="/images/sections/map-showcase.jpg"
                alt="VakayGo 3D Interactive Global Map"
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 50vw, 100vw"
                quality={80}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/30 to-transparent" />

              {/* Floating live HUD badges */}
              <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 bg-navy-900/85 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Mapped Local Places
                </span>
                <span className="inline-flex items-center gap-1.5 bg-gold-500/90 backdrop-blur-md text-navy-900 text-xs font-bold px-3 py-1.5 rounded-full">
                  <Play size={11} className="fill-navy-900" />
                  3D Drone Flyover Tours
                </span>
              </div>

              <div className="absolute bottom-3 left-4 right-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                {[
                  "🔥 Iconic Landmarks",
                  "⭐ Ratings & Reviews",
                  "🛰️ 3D Satellite Terrain",
                  "📍 Near Me GPS",
                ].map((pill) => (
                  <span
                    key={pill}
                    className="flex-shrink-0 bg-white/15 backdrop-blur-md text-white text-[11px] font-medium px-2.5 py-1 rounded-lg border border-white/15"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-7 md:p-8 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-gold-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <Compass size={15} />
                  Interactive 3D Atlas
                </div>
                <h3
                  className="text-2xl md:text-3xl font-bold text-white leading-snug"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Explore All 34 Destinations in Real-Time 3D
                </h3>
                <p className="mt-2.5 text-white/70 text-sm md:text-base leading-relaxed">
                  Pan across 3D volcanic peaks, Mediterranean calderas, and turquoise Caribbean bays, filter by 10 categories, watch automated aerial flyover tours, and browse live viewport-synced place cards.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-navy-900 font-bold text-sm px-6 py-3 rounded-xl shadow-lg transition-all duration-200 hover:scale-[1.02]"
                >
                  Launch 3D Map
                  <ArrowRight size={16} />
                </Link>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  <Layers size={13} /> Satellite · Outdoors · Night Mode
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: AI Trip Planner & Concierge */}
          <div className="group relative rounded-3xl overflow-hidden border border-white/15 bg-navy-800/80 shadow-2xl flex flex-col justify-between min-h-[440px]">
            <div className="relative h-60 overflow-hidden">
              <Image
                src="/images/sections/value-explore.jpg"
                alt="VakayGo AI Caribbean Trip Planner"
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 50vw, 100vw"
                quality={80}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/30 to-transparent" />

              <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 bg-teal-500/90 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full">
                  <Sparkles size={12} />
                  AI Itinerary Engine
                </span>
                <span className="inline-flex items-center gap-1.5 bg-navy-900/85 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15">
                  <Calendar size={12} />
                  Day-by-Day + Budget Breakdown
                </span>
              </div>

              {/* Sample itinerary preview chip */}
              <div className="absolute bottom-3 left-4 right-4 bg-navy-900/85 backdrop-blur-md border border-white/15 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-gold-400 uppercase tracking-wider">
                    Sample Prompt
                  </p>
                  <p className="text-xs text-white truncate">
                    &ldquo;5-day romantic getaway in St. Lucia with Pitons sailing &amp; beachfront dining&rdquo;
                  </p>
                </div>
                <span className="ml-3 flex-shrink-0 bg-gold-500/20 text-gold-300 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gold-400/30">
                  Sample idea
                </span>
              </div>
            </div>

            <div className="p-7 md:p-8 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-teal-300 text-xs font-bold uppercase tracking-wider mb-2">
                  <Sparkles size={15} />
                  AI Travel Concierge
                </div>
                <h3
                  className="text-2xl md:text-3xl font-bold text-white leading-snug"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Custom Day-by-Day Itineraries Grounded in Real Places
                </h3>
                <p className="mt-2.5 text-white/70 text-sm md:text-base leading-relaxed">
                  Pick your destination, dates, pace, and budget. Our AI uses places in the directory to suggest a day-by-day plan. Review the itinerary and check business details and availability before traveling.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/trips/new"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-lg transition-all duration-200 hover:scale-[1.02]"
                >
                  Build My AI Itinerary
                  <ArrowRight size={16} />
                </Link>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  <MapPin size={13} /> Works across all 34 destinations
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
