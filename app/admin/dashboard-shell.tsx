import type { Metadata, Viewport } from "next";
import AdminLayoutClient from "./AdminLayoutClient";

// Server wrapper so /admin can export metadata (the existing layout is a
// client component and cannot). Installs the panel as its own home-screen app.
export const metadata: Metadata = {
  title: "VakayGo Admin",
  robots: "noindex, nofollow",
  manifest: "/admin-manifest.json",
  appleWebApp: { capable: true, title: "VG Admin", statusBarStyle: "black-translucent" },
  icons: { apple: "/admin-icon-192.png" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#1A6B6A",
  width: "device-width",
  initialScale: 1,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
