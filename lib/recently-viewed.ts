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
    const updated = [listing, ...filtered].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable (SSR, private browsing, etc.)
  }
}

export function getRecentlyViewed(): RecentListing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentListing[];
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
