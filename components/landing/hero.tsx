import { Search, MapPin, Calendar } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient — replace with real hero image later */}
      <div className="absolute inset-0 bg-gradient-to-br from-navy-700 via-teal-700 to-navy-900" />
      <div className="absolute inset-0 bg-[url('/images/hero/hero-pattern.svg')] opacity-5" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/20 to-transparent" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center pt-20">
        <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-4 py-1.5 text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-gold-400 rounded-full animate-pulse" />
          Launching in Grenada — 2026
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Your Caribbean
          <br />
          Adventure{" "}
          <span className="text-gold-400">Starts Here</span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-cream-200 max-w-2xl mx-auto leading-relaxed">
          Discover stays, tours, dining, events, and experiences across the
          islands — all in one place, powered by locals who know it best.
        </p>

        {/* Search Bar */}
        <div className="mt-10 mx-auto max-w-3xl">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2 flex flex-col md:flex-row gap-2">
            <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-3">
              <MapPin size={20} className="text-gold-500 shrink-0" />
              <input
                type="text"
                placeholder="Where are you going?"
                className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm font-medium"
                disabled
              />
            </div>
            <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-3">
              <Calendar size={20} className="text-gold-500 shrink-0" />
              <input
                type="text"
                placeholder="When?"
                className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm font-medium"
                disabled
              />
            </div>
            <button className="bg-gold-500 hover:bg-gold-600 text-white px-8 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
              <Search size={18} />
              Explore
            </button>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="mt-8 flex flex-wrap justify-center gap-8 text-sm text-cream-300">
          <div className="flex items-center gap-2">
            <span className="text-gold-400 font-bold">500+</span> Experiences
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gold-400 font-bold">Verified</span> Local Operators
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gold-400 font-bold">Instant</span> Booking
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" className="w-full h-auto">
          <path
            fill="#FEFCF7"
            d="M0,96L48,85.3C96,75,192,53,288,53.3C384,53,480,75,576,80C672,85,768,75,864,58.7C960,43,1056,21,1152,21.3C1248,21,1344,43,1392,53.3L1440,64L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z"
          />
        </svg>
      </div>
    </section>
  );
}
