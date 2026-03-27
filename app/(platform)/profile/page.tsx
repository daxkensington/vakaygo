"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { User, CalendarCheck, Heart, MapPin, Save, Loader2, LogOut } from "lucide-react";

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (authLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 px-6 pt-20">
          <User size={48} className="text-navy-200 mb-6" />
          <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
            Sign in to view your profile
          </h1>
          <Link href="/auth/signin" className="mt-6 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
            Sign In
          </Link>
        </div>
      </>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-3xl px-6 py-10">
          {/* Profile Header */}
          <div className="flex items-center gap-6 mb-10">
            <div className="w-20 h-20 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-3xl">
              {user.name?.charAt(0) || "?"}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>
                {user.name}
              </h1>
              <p className="text-navy-400">{user.email}</p>
              <span className="inline-block mt-1 bg-teal-50 text-teal-600 text-xs font-semibold px-3 py-1 rounded-full capitalize">
                {user.role}
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <Link href="/bookings" className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-1 text-center">
              <CalendarCheck size={24} className="text-gold-500 mx-auto mb-3" />
              <p className="font-semibold text-navy-700">My Bookings</p>
              <p className="text-sm text-navy-400 mt-1">View your trips</p>
            </Link>
            <Link href="/explore" className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-1 text-center">
              <Heart size={24} className="text-gold-500 mx-auto mb-3" />
              <p className="font-semibold text-navy-700">Saved</p>
              <p className="text-sm text-navy-400 mt-1">Your wishlist</p>
            </Link>
            <Link href="/explore" className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-1 text-center">
              <MapPin size={24} className="text-gold-500 mx-auto mb-3" />
              <p className="font-semibold text-navy-700">Explore</p>
              <p className="text-sm text-navy-400 mt-1">Find experiences</p>
            </Link>
          </div>

          {/* Edit Profile */}
          <form onSubmit={handleSave} className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)] mb-6">
            <h2 className="text-xl font-bold text-navy-700 mb-6">Edit Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">Email</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-cream-100 text-navy-400 cursor-not-allowed"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-6">
              <button
                type="submit"
                disabled={saving}
                className="bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
              {saved && <span className="text-sm text-teal-600 font-medium">Saved!</span>}
            </div>
          </form>

          {/* Sign Out */}
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>
      <Footer />
    </>
  );
}
