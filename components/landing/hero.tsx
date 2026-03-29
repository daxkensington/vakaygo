"use client";

import { useEffect, useState } from "react";
import { Search, MapPin, ChevronDown } from "lucide-react";

const heroImages = [
  "/images/hero/caribbean-hero.jpg",
  "/images/islands/grenada.jpg",
  "/images/islands/st-lucia.jpg",
  "/images/islands/jamaica.jpg",
  "/images/islands/barbados.jpg",
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
          7,200+ listings across 21 Caribbean islands
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
        <form
          className="mt-12 mx-auto max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const dest = (form.elements.namedItem("destination") as HTMLSelectElement)?.value || "";
            const q = (form.elements.namedItem("q") as HTMLInputElement)?.value || "";
            const params = new URLSearchParams();
            if (dest) params.set("island", dest);
            if (q) params.set("q", q);
            window.location.href = `/explore?${params}`;
          }}
        >
          <div className="bg-white/[0.07] backdrop-blur-xl rounded-2xl p-2 shadow-[0_8px_60px_rgba(0,0,0,0.3)] border border-white/10">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm">
                <MapPin size={20} className="text-gold-500 shrink-0" />
                <div className="text-left w-full">
                  <p className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">
                    Destination
                  </p>
                  <select
                    name="destination"
                    className="w-full bg-transparent text-navy-700 outline-none text-sm font-medium mt-0.5 appearance-none cursor-pointer"
                  >
                    <option value="">All Caribbean Islands</option>
                    <option value="grenada">🇬🇩 Grenada</option>
                    <option value="trinidad-and-tobago">🇹🇹 Trinidad & Tobago</option>
                    <option value="barbados">🇧🇧 Barbados</option>
                    <option value="st-lucia">🇱🇨 St. Lucia</option>
                    <option value="jamaica">🇯🇲 Jamaica</option>
                    <option value="bahamas">🇧🇸 Bahamas</option>
                    <option value="antigua">🇦🇬 Antigua</option>
                    <option value="aruba">🇦🇼 Aruba</option>
                    <option value="dominican-republic">🇩🇴 Dominican Republic</option>
                    <option value="puerto-rico">🇵🇷 Puerto Rico</option>
                    <option value="curacao">🇨🇼 Curaçao</option>
                    <option value="cayman-islands">🇰🇾 Cayman Islands</option>
                    <option value="us-virgin-islands">🇻🇮 USVI</option>
                    <option value="dominica">🇩🇲 Dominica</option>
                    <option value="st-vincent">🇻🇨 St. Vincent</option>
                    <option value="st-kitts">🇰🇳 St. Kitts</option>
                    <option value="turks-and-caicos">🇹🇨 Turks & Caicos</option>
                    <option value="bonaire">Bonaire</option>
                    <option value="martinique">🇲🇶 Martinique</option>
                    <option value="guadeloupe">🇬🇵 Guadeloupe</option>
                    <option value="british-virgin-islands">🇻🇬 BVI</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm">
                <Search size={20} className="text-gold-500 shrink-0" />
                <div className="text-left w-full">
                  <p className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">
                    Search
                  </p>
                  <input
                    type="text"
                    name="q"
                    placeholder="Hotels, tours, restaurants..."
                    className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm font-medium mt-0.5"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="bg-gold-500 hover:bg-gold-600 text-white px-10 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] hover:scale-[1.02]"
              >
                <Search size={18} />
                <span className="hidden md:inline">Explore</span>
              </button>
            </div>
          </div>
        </form>

        {/* Stats */}
        <div className="mt-14 flex flex-wrap justify-center gap-12 text-sm">
          {[
            { value: "7,200+", label: "Listings" },
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
