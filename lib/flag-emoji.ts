/**
 * Country-flag emoji are pairs of "regional indicator" letters. A platform
 * without flag artwork draws the two letters instead, so the header read
 * "US $ USD" and breadcrumbs "GD Grenada".
 *
 * Windows ships no flag emoji in its system emoji font. Firefox is the
 * exception there: it bundles its own emoji font, flags included. Every
 * other common platform (macOS, iOS, Android, ChromeOS, desktop Linux with
 * Noto) draws them.
 */
export function flagEmojiSupported(userAgent: string | null | undefined): boolean {
  const ua = userAgent || "";
  if (!/Windows/i.test(ua)) return true;
  return /Firefox\//i.test(ua) && !/Seamonkey\//i.test(ua);
}

/** Class set on <html> where flags cannot be drawn; `.flag-emoji` is hidden under it (app/globals.css). */
export const NO_FLAG_EMOJI_CLASS = "no-flag-emoji";
