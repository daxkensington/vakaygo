"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  User,
  CalendarCheck,
  Heart,
  MapPin,
  Save,
  Loader2,
  LogOut,
  Phone,
  Mail,
  Shield,
  Clock,
  Star,
  Bookmark,
  LayoutDashboard,
} from "lucide-react";

type ProfileStats = {
  bookings: number;
  reviews: number;
  saved: number;
};

type ProfileData = {
  phone: string | null;
  createdAt: string;
};

export default function ProfilePage() {
  const { user, loading: authLoading, signOut, refresh } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<ProfileStats>({ bookings: 0, reviews: 0, saved: 0 });
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch full profile data (stats + phone + createdAt)
  useEffect(() => {
    if (!user) return;
    setName(user.name || "");

    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
          setProfileData({ phone: data.user.phone, createdAt: data.user.createdAt });
          setPhone(data.user.phone || "");
        }
      } catch {
        // Silently fail — stats will show 0
      } finally {
        setStatsLoading(false);
      }
    }
    fetchProfile();
  }, [user]);

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
          <Link href="/auth/signin" className="mt-6 bg-gold-700 hover:bg-gold-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
            Sign In
          </Link>
        </div>
      </>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update profile");
        setSaving(false);
        return;
      }

      const data = await res.json();
      setPhone(data.user.phone || "");
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Refresh auth context so header/name updates globally
      await refresh();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  const memberSince = profileData?.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-3xl px-6 py-10">
          {/* Profile Header */}
          <div className="flex items-center gap-6 mb-8">
            <div className="w-20 h-20 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-3xl shadow-sm">
              {user.name?.charAt(0)?.toUpperCase() || "?"}
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

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <CalendarCheck size={20} className="text-gold-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-navy-700">
                {statsLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : stats.bookings}
              </p>
              <p className="text-xs text-navy-400 mt-1">Bookings</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <Star size={20} className="text-gold-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-navy-700">
                {statsLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : stats.reviews}
              </p>
              <p className="text-xs text-navy-400 mt-1">Reviews</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] text-center">
              <Bookmark size={20} className="text-gold-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-navy-700">
                {statsLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : stats.saved}
              </p>
              <p className="text-xs text-navy-400 mt-1">Saved</p>
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Link href="/bookings" className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-1 text-center">
              <CalendarCheck size={24} className="text-gold-500 mx-auto mb-3" />
              <p className="font-semibold text-navy-700">My Bookings</p>
              <p className="text-sm text-navy-400 mt-1">View your trips</p>
            </Link>
            <Link href="/explore" className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-1 text-center">
              <Heart size={24} className="text-gold-500 mx-auto mb-3" />
              <p className="font-semibold text-navy-700">Saved / Wishlist</p>
              <p className="text-sm text-navy-400 mt-1">Your favorites</p>
            </Link>
            <Link href="/explore" className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-1 text-center">
              <MapPin size={24} className="text-gold-500 mx-auto mb-3" />
              <p className="font-semibold text-navy-700">Explore</p>
              <p className="text-sm text-navy-400 mt-1">Find experiences</p>
            </Link>
          </div>

          {/* Edit Profile Form */}
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
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">Phone</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-300" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-300" />
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-cream-100 text-navy-400 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-500 mt-4">{error}</p>
            )}
            <div className="flex items-center gap-4 mt-6">
              <button
                type="submit"
                disabled={saving}
                className="bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
              {saved && <span className="text-sm text-teal-600 font-medium">Profile updated!</span>}
            </div>
          </form>

          {/* Account Info */}
          <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)] mb-6">
            <h2 className="text-xl font-bold text-navy-700 mb-4">Account</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-navy-500">
                <Mail size={16} className="text-navy-300" />
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-3 text-navy-500">
                <Shield size={16} className="text-navy-300" />
                <span className="capitalize">{user.role}</span>
              </div>
              {memberSince && (
                <div className="flex items-center gap-3 text-navy-500">
                  <Clock size={16} className="text-navy-300" />
                  <span>Member since {memberSince}</span>
                </div>
              )}
            </div>
          </div>

          {/* Operator Dashboard Link */}
          {user.role === "operator" && (
            <Link
              href="/operator"
              className="flex items-center gap-3 bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all hover:-translate-y-1 mb-6"
            >
              <LayoutDashboard size={24} className="text-gold-500" />
              <div>
                <p className="font-semibold text-navy-700">Go to Dashboard</p>
                <p className="text-sm text-navy-400">Manage your listings and bookings</p>
              </div>
            </Link>
          )}

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
