"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ListPlus,
  CalendarCheck,
  Star,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/components/ui/focus-trap";
import { useAuth } from "@/lib/auth-context";
import { invalidateOperatorRequests, OPERATOR_SESSION_EXPIRED, operatorSignInHref } from "@/lib/operator-session";

const navItems = [
  { label: "Dashboard", href: "/operator", icon: LayoutDashboard },
  { label: "Listings", href: "/operator/listings", icon: ListPlus },
  { label: "Bookings", href: "/operator/bookings", icon: CalendarCheck },
  { label: "Analytics", href: "/operator/analytics", icon: BarChart3 },
  { label: "Reviews", href: "/operator/reviews", icon: Star },
  { label: "Payouts", href: "/operator/payouts", icon: DollarSign },
  { label: "Settings", href: "/operator/settings", icon: Settings },
];

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [expired, setExpired] = useState(false);
  const publicPage = pathname === "/operator/onboarding/terms";

  useLayoutEffect(() => {
    invalidateOperatorRequests();
    return invalidateOperatorRequests;
  }, [user?.id, user?.role, loading, publicPage]);

  useEffect(() => {
    const expire = () => { if (!publicPage) setExpired(true); };
    window.addEventListener(OPERATOR_SESSION_EXPIRED, expire);
    return () => window.removeEventListener(OPERATOR_SESSION_EXPIRED, expire);
  }, [publicPage]);

  useEffect(() => {
    if (!publicPage && !loading && (!user || expired)) {
      router.replace(operatorSignInHref(pathname));
    }
  }, [publicPage, loading, user, expired, pathname, router]);

  if (!publicPage && loading) {
    return <main className="min-h-screen bg-cream-50 p-8" role="status">Checking your sign-in…</main>;
  }
  if (!publicPage && (!user || expired)) {
    return (
      <main className="min-h-screen bg-cream-50 p-8">
        <h1 className="text-2xl font-bold text-navy-700">Sign in to your business dashboard</h1>
        <p className="mt-3">Sign in to continue to this page.</p>
        <Link href={operatorSignInHref(pathname)} className="mt-4 inline-block font-semibold underline">Sign In</Link>
      </main>
    );
  }
  return <DashboardShell>{children}</DashboardShell>;
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useFocusTrap(sidebarRef, sidebarOpen);
  useEffect(() => {
    const closeAtDesktop = () => { if (window.innerWidth >= 1024) setSidebarOpen(false); };
    window.addEventListener("resize", closeAtDesktop);
    return () => window.removeEventListener("resize", closeAtDesktop);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setSidebarOpen(false); menuTrigger.current?.focus(); } };
    const originalOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close business navigation"]')?.focus();
    document.addEventListener("keydown", close);
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener("keydown", close); };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-cream-50 flex">
      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        id="business-navigation"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0 visible" : "-translate-x-full invisible lg:visible"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="p-6 flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-navy-700">
              Vakay<span className="text-gold-700">Go</span>
            </Link>
            <button
              type="button"
              aria-label="Close business navigation"
              className="lg:hidden text-navy-400"
              onClick={() => { setSidebarOpen(false); menuTrigger.current?.focus(); }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Operator badge */}
          <div className="px-6 mb-6">
            <div className="bg-gold-50 rounded-xl p-3">
              <p className="text-sm font-semibold text-navy-700">
                {user?.businessName || user?.name || "Operator"}
              </p>
              <p className="text-xs text-navy-400 mt-0.5">Business Dashboard</p>
            </div>
          </div>

          {/* Nav */}
          <nav aria-label="Business navigation" className="flex-1 px-3 space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/operator"
                  ? pathname === "/operator"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  aria-current={isActive ? "page" : undefined}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gold-700 text-white"
                      : "text-navy-500 hover:bg-cream-50 hover:text-navy-700"
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Sign out */}
          <div className="p-3">
            {user ? <button
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true); setSignOutError("");
                try { await signOut(); }
                catch { setSignOutError("Sign-out could not be confirmed. Please try again."); }
                finally { setSigningOut(false); }
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-navy-400 hover:bg-cream-50 hover:text-navy-700 w-full transition-colors"
            >
              <LogOut size={18} />
              Sign Out
            </button> : <Link href={operatorSignInHref(pathname)} className="block px-3 py-2.5 text-sm font-semibold underline">Sign In</Link>}
            {signOutError && <p role="alert" className="px-3 text-sm text-red-700">{signOutError}</p>}
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => { setSidebarOpen(false); menuTrigger.current?.focus(); }}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="bg-white shadow-sm sticky top-0 z-30 px-6 py-4 flex items-center justify-between lg:justify-end">
          <button
            ref={menuTrigger}
            type="button"
            aria-label="Open business navigation"
            aria-expanded={sidebarOpen}
            aria-controls="business-navigation"
            className="lg:hidden text-navy-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-4">
            <Link
              href="/operator/listings/new"
              className="bg-gold-700 hover:bg-gold-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              + New Listing
            </Link>
            <div className="w-8 h-8 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold text-sm">
              {user?.name?.charAt(0) || "O"}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
