"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  ListPlus,
  Users,
  CalendarCheck,
  DollarSign,
  BarChart3,
  MessageSquare,
  Settings,
  ClipboardList,
  FileText,
  ArrowLeft,
  Menu,
  X,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  BookOpen,
  Tag,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/listings", label: "Listings", icon: ListPlus },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/revenue", label: "Revenue", icon: DollarSign },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/promos", label: "Promo Codes", icon: Tag },
  { href: "/admin/disputes", label: "Disputes", icon: AlertTriangle },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare },
  { href: "/admin/blog", label: "Blog", icon: BookOpen },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/content", label: "Content", icon: FileText },
  { href: "/admin/audit", label: "Audit Log", icon: ClipboardList },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-50">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-50">
        <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-[var(--shadow-elevated)]">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-navy-800" style={{ fontFamily: "var(--font-display)" }}>
            Access Denied
          </h1>
          <p className="mb-6 text-navy-400">
            You don&apos;t have permission to access the admin panel.
            {!user && " Please sign in with an admin account."}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-gold-700 px-6 py-3 font-medium text-white transition-colors hover:bg-gold-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-navy-800 transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between px-5">
          <span
            className="text-xl font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            VakayGo <span className="text-gold-400">Admin</span>
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-white/60 hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                  ${
                    active
                      ? "border-l-2 border-gold-400 bg-gold-700/10 text-gold-400"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to site */}
        <div className="px-3 pb-2">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5 shrink-0" />
            Back to site
          </Link>
        </div>

        {/* User info */}
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500/20 text-sm font-semibold text-gold-400">
                {user.name?.charAt(0) ?? user.email.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.name ?? "Admin"}
              </p>
              <p className="truncate text-xs text-white/40">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col bg-cream-50 min-h-screen">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-cream-300 bg-cream-50/80 px-4 backdrop-blur-sm lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-navy-700 hover:bg-navy-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span
            className="text-lg font-bold text-navy-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            VakayGo <span className="text-gold-500">Admin</span>
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
