"use client";

import { useEffect, useState } from "react";
import { Search, MapPin, Calendar, ChevronDown } from "lucide-react";

const heroImages = [
  "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1920&q=80&auto=format",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format",
  "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=1920&q=80&auto=format",
];

export function Hero() {
  const [currentImage, setCurrentImage] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(true);
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden">
      {/* Rotating background images */}
      {heroImages.map((img, i) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out"
          style={{
            opacity: currentImage === i ? 1 : 0,
            backgroundImage: `url(${img})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ))}

      {/* Cinematic overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/60 via-navy-900/40 to-navy-900/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-900/30 to-transparent" />

      {/* Content */}
      <div
        className={`relative z-10 mx-auto max-w-6xl px-6 text-center transition-all duration-1000 ${
          loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-white/90 border border-white/20 rounded-full px-5 py-2 text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-gold-400 rounded-full animate-pulse" />
          Now launching in Grenada
        </div>

        <h1
          className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.05] tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your Entire Trip.
          <br />
          <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-gold-500 bg-clip-text text-transparent">
            One Platform.
          </span>
        </h1>

        <p className="mt-8 text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed font-light">
          Stays. Tours. Dining. Events. Transport. Guides.
          <br className="hidden md:block" />
          Everything you need for the perfect Caribbean vacation.
        </p>

        {/* Search Bar */}
        <div className="mt-12 mx-auto max-w-3xl">
          <div className="bg-white/[0.07] backdrop-blur-xl rounded-2xl p-2 shadow-[0_8px_60px_rgba(0,0,0,0.3)] border border-white/10">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm">
                <MapPin size={20} className="text-gold-500 shrink-0" />
                <div className="text-left">
                  <p className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">
                    Destination
                  </p>
                  <input
                    type="text"
                    placeholder="Grenada, Caribbean"
                    className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm font-medium mt-0.5"
                    disabled
                  />
                </div>
              </div>
              <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm">
                <Calendar size={20} className="text-gold-500 shrink-0" />
                <div className="text-left">
                  <p className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">
                    Dates
                  </p>
                  <input
                    type="text"
                    placeholder="Add your travel dates"
                    className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm font-medium mt-0.5"
                    disabled
                  />
                </div>
              </div>
              <button className="bg-gold-500 hover:bg-gold-600 text-white px-10 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] hover:scale-[1.02]">
                <Search size={18} />
                <span className="hidden md:inline">Explore</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-14 flex flex-wrap justify-center gap-12 text-sm">
          {[
            { value: "4,900+", label: "Listings" },
            { value: "21", label: "Islands" },
            { value: "6", label: "Categories" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold text-gold-400">{stat.value}</p>
              <p className="text-white/60 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <ChevronDown size={28} className="text-white/40" />
      </div>

      {/* Image indicators */}
      <div className="absolute bottom-8 right-8 z-10 flex gap-2">
        {heroImages.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentImage(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              currentImage === i
                ? "bg-gold-400 w-6"
                : "bg-white/30 hover:bg-white/50"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
