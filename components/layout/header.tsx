"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFocusTrap } from "@/components/ui/focus-trap";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, User, LayoutDashboard, Star } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { CurrencySwitcher } from "@/components/layout/currency-switcher";
import { NotificationBell } from "@/components/layout/notification-bell";
import { MessageBadge } from "@/components/layout/message-badge";

export function Header() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const isLanding = pathname === "/";

  useFocusTrap(mobileMenuRef, mobileOpen);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled || !isLanding
          ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_20px_rgba(0,0,0,0.06)]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6 flex items-center justify-between h-16 md:h-18">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/images/logo.jpg"
            alt="VakayGo"
            width={180}
            height={50}
            className={`h-10 md:h-12 w-auto object-contain transition-all duration-300 ${
              !scrolled && isLanding ? "brightness-0 invert mix-blend-screen" : ""
            }`}
            priority
          />
        </Link>

        <nav role="navigation" aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            href="/explore"
            aria-current={pathname === "/explore" ? "page" : undefined}
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Explore
          </Link>
          <Link
            href="/islands"
            aria-current={pathname === "/islands" ? "page" : undefined}
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Islands
          </Link>
          <Link
            href="/map"
            aria-current={pathname === "/map" ? "page" : undefined}
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Map
          </Link>
          <Link
            href="/guides"
            aria-current={pathname.startsWith("/guides") ? "page" : undefined}
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Guides
          </Link>
          {user && (
            <Link
              href="/trips"
              aria-current={pathname === "/trips" ? "page" : undefined}
              className={`transition-colors duration-300 hover:text-gold-500 ${
                scrolled || !isLanding ? "text-navy-500" : "text-white/80"
              }`}
            >
              Trips
            </Link>
          )}
          <Link
            href="/services"
            aria-current={pathname === "/services" ? "page" : undefined}
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            Services
          </Link>
          <Link
            href="/for-businesses"
            aria-current={pathname === "/for-businesses" ? "page" : undefined}
            className={`transition-colors duration-300 hover:text-gold-500 ${
              scrolled || !isLanding ? "text-navy-500" : "text-white/80"
            }`}
          >
            For Businesses
          </Link>

          <div className={`transition-colors ${scrolled || !isLanding ? "text-navy-500" : "text-white/80"}`}>
            <CurrencySwitcher />
          </div>
          <div className={`transition-colors ${scrolled || !isLanding ? "text-navy-500" : "text-white/80"}`}>
            <LanguageSwitcher />
          </div>

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
                href="/rewards"
                className="flex items-center gap-1 text-gold-500 hover:text-gold-600 transition-colors"
              >
                <Star size={14} className="fill-gold-500" />
                Rewards
              </Link>
              <MessageBadge scrolled={scrolled} isLanding={isLanding} />
              <NotificationBell scrolled={scrolled} isLanding={isLanding} />
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
          aria-expanded={mobileOpen}
          className={`md:hidden p-2 transition-colors ${
            scrolled || !isLanding ? "text-navy-700" : "text-white"
          }`}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div ref={mobileMenuRef} role="navigation" aria-label="Mobile navigation" className="md:hidden bg-white/95 backdrop-blur-xl border-t border-cream-200 px-6 py-6 space-y-4 shadow-lg">
          <Link href="/explore" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
            Explore
          </Link>
          <Link href="/guides" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
            Guides
          </Link>
          <Link href="/for-businesses" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
            For Businesses
          </Link>
          {user ? (
            <>
              <Link href="/trips" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
                Trip Planner
              </Link>
              <Link href="/messages" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
                Messages
              </Link>
              <Link href="/bookings" className="block text-navy-600 font-medium py-2" onClick={() => setMobileOpen(false)}>
                My Bookings
              </Link>
              <Link href="/rewards" className="block text-gold-500 font-medium py-2 flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <Star size={16} className="fill-gold-500" />
                Rewards
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
