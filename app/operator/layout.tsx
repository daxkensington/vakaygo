"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

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
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="p-6 flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-navy-700">
              Vakay<span className="text-gold-500">Go</span>
            </Link>
            <button
              className="lg:hidden text-navy-400"
              onClick={() => setSidebarOpen(false)}
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
          <nav className="flex-1 px-3 space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/operator"
                  ? pathname === "/operator"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
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
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-navy-400 hover:bg-cream-50 hover:text-navy-700 w-full transition-colors"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="bg-white shadow-sm sticky top-0 z-30 px-6 py-4 flex items-center justify-between lg:justify-end">
          <button
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
