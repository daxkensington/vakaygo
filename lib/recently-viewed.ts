const STORAGE_KEY = "vakaygo_recently_viewed";
const MAX_ITEMS = 12;

export type RecentListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
  islandSlug: string;
  image: string | null;
};

export function addRecentlyViewed(listing: RecentListing): void {
  try {
    const existing = getRecentlyViewed();
    const filtered = existing.filter((item) => item.id !== listing.id);
    // History is descriptive only. Eligibility and prices are refreshed when shown.
    const updated = [{ ...listing, priceAmount: null, priceUnit: null }, ...filtered].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable (SSR, private browsing, etc.)
  }
}

export function getRecentlyViewed(): RecentListing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentListing => Boolean(item && typeof item === "object"
      && ["id", "title", "slug", "type", "islandSlug"].every(key => typeof item[key] === "string" && item[key])
      && (item.image === null || typeof item.image === "string")))
      .slice(0, MAX_ITEMS).map(item => ({ ...item, priceAmount: null, priceUnit: null }));
  } catch {
    return [];
  }
}

export function clearRecentlyViewed(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
