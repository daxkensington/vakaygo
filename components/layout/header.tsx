"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_20px_rgba(0,0,0,0.06)]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-18">
        <Link href="/" className="flex items-center gap-2">
          <span
            className={`text-2xl font-bold tracking-tight transition-colors duration-300 ${
              scrolled ? "text-navy-700" : "text-white"
            }`}
          >
            Vakay
            <span className="text-gold-500">Go</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          {[
            { label: "How It Works", href: "#how-it-works" },
            { label: "Explore", href: "#categories" },
            { label: "For Businesses", href: "#for-businesses" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`transition-colors duration-300 hover:text-gold-500 ${
                scrolled ? "text-navy-500" : "text-white/80 hover:text-white"
              }`}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#waitlist"
            className="bg-gold-500 text-white px-6 py-2.5 rounded-full hover:bg-gold-600 transition-all duration-300 hover:shadow-[0_4px_15px_rgba(200,145,46,0.3)]"
          >
            Join Waitlist
          </a>
        </nav>

        <button
          className={`md:hidden p-2 transition-colors ${
            scrolled ? "text-navy-700" : "text-white"
          }`}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-cream-200 px-6 py-6 space-y-4 shadow-lg">
          {[
            { label: "How It Works", href: "#how-it-works" },
            { label: "Explore", href: "#categories" },
            { label: "For Businesses", href: "#for-businesses" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="block text-navy-600 font-medium py-2"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#waitlist"
            className="block bg-gold-500 text-white text-center px-5 py-3.5 rounded-full font-semibold"
            onClick={() => setMobileOpen(false)}
          >
            Join Waitlist
          </a>
        </div>
      )}
    </header>
  );
}
