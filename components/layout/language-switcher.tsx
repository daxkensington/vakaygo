"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { locales, localeNames, localeFlags, type Locale } from "@/i18n/config";

export function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Locale>("en");

  // Read current locale from cookie on mount
  if (typeof window !== "undefined" && current === "en") {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("locale="));
    if (cookie) {
      const val = cookie.split("=")[1] as Locale;
      if (locales.includes(val) && val !== current) {
        setCurrent(val);
      }
    }
  }

  function switchLocale(locale: Locale) {
    document.cookie = `locale=${locale};path=/;max-age=${365 * 24 * 60 * 60}`;
    setCurrent(locale);
    setOpen(false);
    window.location.reload();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Change language"
        className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-gold-500"
      >
        <Globe size={16} />
        <span className="hidden sm:inline">{localeFlags[current]}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-[var(--shadow-elevated)] py-2 min-w-[180px] border border-cream-200">
            {locales.map((locale) => (
              <button
                key={locale}
                onClick={() => switchLocale(locale)}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-cream-50 transition-colors ${
                  current === locale
                    ? "text-gold-600 font-semibold bg-gold-50"
                    : "text-navy-600"
                }`}
              >
                <span className="text-lg">{localeFlags[locale]}</span>
                <span>{localeNames[locale]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
