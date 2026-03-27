"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-cream-50/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight text-navy-700">
            Vakay<span className="text-gold-500">Go</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-navy-500">
          <a href="#how-it-works" className="hover:text-gold-500 transition-colors">
            How It Works
          </a>
          <a href="#categories" className="hover:text-gold-500 transition-colors">
            Explore
          </a>
          <a href="#for-businesses" className="hover:text-gold-500 transition-colors">
            For Businesses
          </a>
          <a
            href="#waitlist"
            className="bg-gold-500 text-white px-5 py-2 rounded-full hover:bg-gold-600 transition-colors"
          >
            Join Waitlist
          </a>
        </nav>

        <button
          className="md:hidden p-2 text-navy-700"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-cream-50 border-t border-cream-300 px-6 py-4 space-y-4">
          <a
            href="#how-it-works"
            className="block text-navy-600 font-medium"
            onClick={() => setMobileOpen(false)}
          >
            How It Works
          </a>
          <a
            href="#categories"
            className="block text-navy-600 font-medium"
            onClick={() => setMobileOpen(false)}
          >
            Explore
          </a>
          <a
            href="#for-businesses"
            className="block text-navy-600 font-medium"
            onClick={() => setMobileOpen(false)}
          >
            For Businesses
          </a>
          <a
            href="#waitlist"
            className="block bg-gold-500 text-white text-center px-5 py-3 rounded-full font-medium"
            onClick={() => setMobileOpen(false)}
          >
            Join Waitlist
          </a>
        </div>
      )}
    </header>
  );
}
