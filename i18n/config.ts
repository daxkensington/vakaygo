export const locales = ["en", "es", "fr", "pt", "nl", "de", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const rtlLocales: readonly Locale[] = ["ar"] as const;

export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  nl: "Nederlands",
  de: "Deutsch",
  ar: "العربية",
};

export const localeFlags: Record<Locale, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
  pt: "🇧🇷",
  nl: "🇳🇱",
  de: "🇩🇪",
  ar: "🇸🇦",
};
