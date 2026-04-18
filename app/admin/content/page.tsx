"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Megaphone,
  Bell,
  Wrench,
  Save,
  Loader2,
  ExternalLink,
  CheckCircle,
} from "lucide-react";

type SettingEntry = {
  value: string;
  updatedBy: string | null;
  updatedAt: string;
};

type Settings = Record<string, SettingEntry>;

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200
        ${checked ? "bg-gold-500" : "bg-navy-200"}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200
          ${checked ? "translate-x-6" : "translate-x-1"} mt-1
        `}
      />
    </button>
  );
}

function TimeAgo({ date }: { date: string }) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  let text = "just now";
  if (days > 0) text = `${days}d ago`;
  else if (hrs > 0) text = `${hrs}h ago`;
  else if (mins > 0) text = `${mins}m ago`;

  return <span className="text-xs text-navy-400">{text}</span>;
}

export default function ContentManagement() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Local form state
  const [promoBannerText, setPromoBannerText] = useState("");
  const [promoBannerLink, setPromoBannerLink] = useState("");
  const [promoBannerEnabled, setPromoBannerEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/platform");
      const data: Settings = await res.json();
      setSettings(data);

      setPromoBannerText(data.promo_banner_text?.value ?? "");
      setPromoBannerLink(data.promo_banner_link?.value ?? "");
      setPromoBannerEnabled(data.promo_banner_enabled?.value === "true");
      setAnnouncementText(data.announcement_text?.value ?? "");
      setAnnouncementEnabled(data.announcement_enabled?.value === "true");
      setMaintenanceMode(data.maintenance_mode?.value === "true");
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function saveSection(section: string, kvPairs: Record<string, string>) {
    setSaving(section);
    setSaved(null);
    try {
      await fetch("/api/admin/platform", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: kvPairs, adminId: user?.id }),
      });
      setSaved(section);
      setTimeout(() => setSaved(null), 3000);
      await fetchSettings();
    } catch {
      // silent
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <div>
      <h1
        className="mb-2 text-3xl font-bold text-navy-700"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Content Management
      </h1>
      <p className="mb-8 text-navy-400">
        Manage promotional banners, announcements, and maintenance mode.
      </p>

      <div className="space-y-6">
        {/* ── Promo Banner ── */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
                <Megaphone size={20} />
              </div>
              <div>
                <h2 className="font-bold text-navy-700">Promo Banner</h2>
                <p className="text-sm text-navy-400">
                  Top-of-page promotional banner visible to all visitors
                </p>
              </div>
            </div>
            <Toggle
              checked={promoBannerEnabled}
              onChange={setPromoBannerEnabled}
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-600">
                Banner Text
              </label>
              <input
                type="text"
                value={promoBannerText}
                onChange={(e) => setPromoBannerText(e.target.value)}
                placeholder="e.g., Book your Grenada adventure — 20% off this week!"
                className="w-full rounded-xl bg-cream-50 px-4 py-3 text-sm text-navy-700 outline-none ring-1 ring-cream-200 transition-all focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-600">
                Banner Link (optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={promoBannerLink}
                  onChange={(e) => setPromoBannerLink(e.target.value)}
                  placeholder="e.g., /explore/grenada"
                  className="flex-1 rounded-xl bg-cream-50 px-4 py-3 text-sm text-navy-700 outline-none ring-1 ring-cream-200 transition-all focus:ring-2 focus:ring-gold-400"
                />
                {promoBannerLink && (
                  <ExternalLink size={16} className="shrink-0 text-navy-300" />
                )}
              </div>
            </div>

            {/* Preview */}
            {promoBannerEnabled && promoBannerText && (
              <div className="mt-2 rounded-xl bg-gold-700 px-4 py-2.5 text-center text-sm font-medium text-white">
                {promoBannerText}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-navy-400">
                {settings.promo_banner_text?.updatedBy && (
                  <span>
                    Last updated by {settings.promo_banner_text.updatedBy}{" "}
                    <TimeAgo date={settings.promo_banner_text.updatedAt} />
                  </span>
                )}
              </div>
              <button
                onClick={() =>
                  saveSection("promo", {
                    promo_banner_text: promoBannerText,
                    promo_banner_link: promoBannerLink,
                    promo_banner_enabled: String(promoBannerEnabled),
                  })
                }
                disabled={saving === "promo"}
                className="inline-flex items-center gap-2 rounded-xl bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-800 disabled:opacity-60"
              >
                {saving === "promo" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : saved === "promo" ? (
                  <CheckCircle size={16} />
                ) : (
                  <Save size={16} />
                )}
                {saved === "promo" ? "Saved!" : "Save Banner"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Platform Announcement ── */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <Bell size={20} />
              </div>
              <div>
                <h2 className="font-bold text-navy-700">Platform Announcement</h2>
                <p className="text-sm text-navy-400">
                  Shows as a banner below the header on all pages
                </p>
              </div>
            </div>
            <Toggle
              checked={announcementEnabled}
              onChange={setAnnouncementEnabled}
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-600">
                Announcement Text
              </label>
              <textarea
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                rows={3}
                placeholder="e.g., We're launching new islands next month! Stay tuned for exciting destinations."
                className="w-full rounded-xl bg-cream-50 px-4 py-3 text-sm text-navy-700 outline-none ring-1 ring-cream-200 transition-all focus:ring-2 focus:ring-gold-400 resize-none"
              />
            </div>

            {/* Preview */}
            {announcementEnabled && announcementText && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2.5 text-sm text-teal-700">
                <Bell size={14} className="shrink-0" />
                {announcementText}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-navy-400">
                {settings.announcement_text?.updatedBy && (
                  <span>
                    Last updated by {settings.announcement_text.updatedBy}{" "}
                    <TimeAgo date={settings.announcement_text.updatedAt} />
                  </span>
                )}
              </div>
              <button
                onClick={() =>
                  saveSection("announcement", {
                    announcement_text: announcementText,
                    announcement_enabled: String(announcementEnabled),
                  })
                }
                disabled={saving === "announcement"}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 disabled:opacity-60"
              >
                {saving === "announcement" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : saved === "announcement" ? (
                  <CheckCircle size={16} />
                ) : (
                  <Save size={16} />
                )}
                {saved === "announcement" ? "Saved!" : "Save Announcement"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Maintenance Mode ── */}
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Wrench size={20} />
              </div>
              <div>
                <h2 className="font-bold text-navy-700">Maintenance Mode</h2>
                <p className="text-sm text-navy-400">
                  When enabled, non-admin visitors see a maintenance page
                </p>
              </div>
            </div>
            <Toggle checked={maintenanceMode} onChange={setMaintenanceMode} />
          </div>

          {maintenanceMode && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Warning:</strong> Maintenance mode is active. All non-admin visitors will see
              a maintenance page instead of the site.
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-navy-400">
              {settings.maintenance_mode?.updatedBy && (
                <span>
                  Last updated by {settings.maintenance_mode.updatedBy}{" "}
                  <TimeAgo date={settings.maintenance_mode.updatedAt} />
                </span>
              )}
            </div>
            <button
              onClick={() =>
                saveSection("maintenance", {
                  maintenance_mode: String(maintenanceMode),
                })
              }
              disabled={saving === "maintenance"}
              className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {saving === "maintenance" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : saved === "maintenance" ? (
                <CheckCircle size={16} />
              ) : (
                <Save size={16} />
              )}
              {saved === "maintenance" ? "Saved!" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
