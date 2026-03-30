"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, User, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function Header() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const isLanding = pathname === "/";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled || !isLanding
          ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_20px_rgba(0,0,0,0.06)]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-18">
        <Link href="/" className="flex items-center gap-2">
          <span
            className={`text-2xl font-bold tracking-tight transition-colors duration-300 ${
              scrolled || !isLanding ? "text-navy-700" : "text-white"
            }`}
          >
            Vakay
            <span className="text-gold-500">Go</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            href="/explore"
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Explore
          </Link>
          <Link
            href="/islands"
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Islands
          </Link>
          <Link
            href="/services"
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Services
          </Link>
          <Link
            href="/for-businesses"
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            For Businesses
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              {user.role === "operator" && (
                <Link
                  href="/operator"
                  className="flex items-center gap-1.5 text-navy-500 hover:text-gold-500 transition-colors"
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </Link>
              )}
              <Link
                href={user.role === "operator" ? "/operator" : "/profile"}
                className="w-9 h-9 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-sm hover:bg-gold-200 transition-colors"
              >
                {user.name?.charAt(0) || <User size={16} />}
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/auth/signin"
                className={`transition-colors duration-300 hover:text-gold-500 ${
                  scrolled || !isLanding ? "text-navy-500" : "text-white/80"
                }`}
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="bg-gold-500 text-white px-6 py-2.5 rounded-full hover:bg-gold-600 transition-all duration-300 hover:shadow-[0_4px_15px_rgba(200,145,46,0.3)]"
              >
                Sign Up
              </Link>
            </div>
          )}
        </nav>

        <button
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className={`md:hidden p-2 transition-colors ${
            scrolled || !isLanding ? "text-navy-700" : "text-white"
          }`}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-cream-200 px-6 py-6 space-y-4 shadow-lg">
          <Link href="/explore" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
            Explore
          </Link>
          <Link href="/for-businesses" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
            For Businesses
          </Link>
          {user ? (
            <>
              <Link href="/bookings" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
                My Bookings
              </Link>
              <Link href="/profile" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
                Profile
              </Link>
              {user.role === "operator" && (
                <Link href="/operator" className="block text-gold-500 font-medium py-2" onClick={() => setMobileOpen(false)}>
                  Operator Dashboard
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href="/auth/signin" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
                Sign In
              </Link>
              <Link href="/auth/signup" className="block bg-gold-500 text-white text-center px-5 py-3.5 rounded-full font-semibold" onClick={() => setMobileOpen(false)}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
