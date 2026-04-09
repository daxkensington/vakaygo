/**
 * Locale-aware formatting utilities for dates, numbers, and currencies.
 */

/**
 * Format a date using the locale's medium date style.
 * Example: "Apr 8, 2026" for en-US, "8 avr. 2026" for fr-FR.
 */
export function formatDate(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);
}

/**
 * Format a number with locale-specific grouping and decimal separators.
 */
export function formatNumber(num: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Format a currency value with the appropriate symbol and locale formatting.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date as a relative time string (e.g., "2 hours ago", "3 days ago").
 * Uses Intl.RelativeTimeFormat for locale-aware output.
 */
export function formatRelativeTime(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  const now = Date.now();
  const diffMs = d.getTime() - now;
  const absDiffMs = Math.abs(diffMs);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  // Choose the best unit
  const seconds = Math.round(absDiffMs / 1000);
  const minutes = Math.round(absDiffMs / (1000 * 60));
  const hours = Math.round(absDiffMs / (1000 * 60 * 60));
  const days = Math.round(absDiffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.round(days / 7);
  const months = Math.round(days / 30);
  const years = Math.round(days / 365);

  const sign = diffMs < 0 ? -1 : 1;

  if (seconds < 60) return rtf.format(sign * seconds, "second");
  if (minutes < 60) return rtf.format(sign * minutes, "minute");
  if (hours < 24) return rtf.format(sign * hours, "hour");
  if (days < 7) return rtf.format(sign * days, "day");
  if (weeks < 5) return rtf.format(sign * weeks, "week");
  if (months < 12) return rtf.format(sign * months, "month");
  return rtf.format(sign * years, "year");
}
