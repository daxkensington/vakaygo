"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFocusTrap } from "@/components/ui/focus-trap";
import Link from "next/link";

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
        <Link href="/" className="flex items-center gap-1.5 group">
          {/* SVG logo — renders crisp at any size, works on any background */}
          <svg
            viewBox="0 0 200 44"
            className="h-9 md:h-10 w-auto"
            aria-label="VakayGo"
          >
            {/* Palm tree to the left of Vakay — fan of 7 drooping fronds over a curved trunk */}
            {(() => {
              const frondClass = `transition-all duration-300 ${
                !scrolled && isLanding ? "fill-white" : "fill-[#1C2333]"
              }`;
              const trunkClass = frondClass;
              return (
                <g>
                  {/* Curved trunk from crown (11, 17) down to baseline */}
                  <path
                    d="M10 17 C10 22 11 28 13 33 C14 36 15 39 16 40 L13 40 C12 38 11 35 10 32 C8 27 8 22 8 17 Z"
                    className={trunkClass}
                  />
                  {/* Crown of fronds — 7 rotated leaf-ellipses fanning upward */}
                  <g transform="translate(11 17)">
                    {[
                      { a: -72, rx: 1.6, ry: 8 },
                      { a: -48, rx: 1.8, ry: 8.5 },
                      { a: -22, rx: 1.9, ry: 9 },
                      { a: 0, rx: 1.8, ry: 8.5 },
                      { a: 22, rx: 1.9, ry: 9 },
                      { a: 48, rx: 1.8, ry: 8.5 },
                      { a: 72, rx: 1.6, ry: 8 },
                    ].map(({ a, rx, ry }, i) => (
                      <ellipse
                        key={i}
                        cx="0"
                        cy={-ry + 1}
                        rx={rx}
                        ry={ry}
                        transform={`rotate(${a})`}
                        className={frondClass}
                      />
                    ))}
                    {/* Crown nub — covers where fronds meet */}
                    <circle r="2" className={frondClass} />
                  </g>
                </g>
              );
            })()}
            {/* "Vakay" text */}
            <text
              x="22" y="32"
              className={`text-[30px] font-bold transition-all duration-300 ${
                !scrolled && isLanding ? "fill-white" : "fill-[#1C2333]"
              }`}
              style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 800, letterSpacing: "-0.5px" }}
            >
              Vakay
            </text>
            {/* "Go" text in gold */}
            <text
              x="122" y="32"
              className="fill-[#C8912E] text-[30px] font-bold"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 800, letterSpacing: "-0.5px" }}
            >
              Go
            </text>
            {/* Gold sunburst behind "Go" */}
            <g transform="translate(155, 6)" opacity="0.9">
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
                <line
                  key={angle}
                  x1="0" y1="0"
                  x2={Math.cos((angle * Math.PI) / 180) * 8}
                  y2={Math.sin((angle * Math.PI) / 180) * 8}
                  stroke="#C8912E"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  transform={`translate(0, 0)`}
                />
              ))}
            </g>
            {/* Wave line */}
            <path
              d="M22 38 Q52 34, 82 38 Q112 42, 142 38 Q157 36, 170 38"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              className={`transition-all duration-300 ${
                !scrolled && isLanding ? "stroke-white/40" : "stroke-[#1A6B6A]/30"
              }`}
            />
          </svg>
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
                className="w-9 h-9 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold text-sm hover:bg-gold-200 transition-colors"
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
                className="bg-gold-700 text-white px-6 py-2.5 rounded-full hover:bg-gold-800 transition-all duration-300 hover:shadow-[0_4px_15px_rgba(200,145,46,0.3)]"
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
              <Link href="/auth/signup" className="block bg-gold-700 text-white text-center px-5 py-3.5 rounded-full font-semibold" onClick={() => setMobileOpen(false)}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
