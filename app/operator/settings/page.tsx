"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Save, Loader2, AlertCircle } from "lucide-react";

export default function OperatorSettingsPage() {
  const { user } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/operator/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        setBusinessName(data.settings.businessName);
        setBusinessDescription(data.settings.businessDescription);
        setBusinessPhone(data.settings.businessPhone);
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/operator/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, businessDescription, businessPhone }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save settings");
      }

      const data = await res.json();
      setBusinessName(data.settings.businessName);
      setBusinessDescription(data.settings.businessDescription);
      setBusinessPhone(data.settings.businessPhone);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h1>
        <p className="text-navy-400 mt-1">
          Manage your business profile and account settings
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Business Profile */}
        <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
          <h2 className="text-xl font-bold text-navy-700 mb-6">Business Profile</h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">
                Business Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                placeholder="Your business name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">
                Business Description
              </label>
              <textarea
                rows={4}
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 resize-none"
                placeholder="Tell travelers about your business"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Phone
                </label>
                <input
                  type="tel"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                  placeholder="+1 473 XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-cream-100 text-navy-400 outline-none cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
          <h2 className="text-xl font-bold text-navy-700 mb-6">Notifications</h2>
          <div className="space-y-4">
            {[
              { label: "New booking received", desc: "Get notified when a traveler books" },
              { label: "Booking cancelled", desc: "Get notified when a booking is cancelled" },
              { label: "New review", desc: "Get notified when a traveler leaves a review" },
              { label: "Payout processed", desc: "Get notified when a payout is sent" },
            ].map((item) => (
              <label key={item.label} className="flex items-center justify-between p-3 rounded-xl hover:bg-cream-50 cursor-pointer">
                <div>
                  <p className="font-medium text-navy-700">{item.label}</p>
                  <p className="text-sm text-navy-400">{item.desc}</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-gold-500" />
              </label>
            ))}
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
          <h2 className="text-xl font-bold text-navy-700 mb-2">Your Plan</h2>
          <div className="flex items-center gap-3 p-4 bg-cream-50 rounded-xl mt-4">
            <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center text-white font-bold text-sm">
              F
            </div>
            <div className="flex-1">
              <p className="font-semibold text-navy-700">Free Plan</p>
              <p className="text-sm text-navy-400">Unlimited listings, bookings, and reviews. Forever free.</p>
            </div>
            <span className="bg-teal-50 text-teal-600 px-3 py-1 rounded-full text-xs font-semibold">
              Active
            </span>
          </div>
          <p className="text-sm text-navy-400 mt-4">
            Upgrade to <span className="font-semibold text-navy-600">Pro ($49/mo)</span> for smart pricing, advanced analytics, and priority placement.
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end gap-4">
          {saved && (
            <span className="text-sm text-teal-600 font-medium">Settings saved!</span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
