export type AutocompleteResult = {
  listings: { title: string; slug: string; island: string; islandSlug: string; type: string }[];
  islands: { name: string; slug: string }[];
};

const slugPattern = /^[a-z0-9-]+$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isSlug = (value: unknown): value is string => isText(value) && value.length <= 200 && slugPattern.test(value);

export function parseAutocompleteResults(value: unknown): AutocompleteResult | null {
  if (!isRecord(value) || !Array.isArray(value.listings) || !Array.isArray(value.islands)) return null;
  return {
    listings: value.listings.filter((item): item is AutocompleteResult["listings"][number] =>
      isRecord(item) && isText(item.title) && isSlug(item.slug) && isText(item.island) && isSlug(item.islandSlug) && isText(item.type)
    ).slice(0, 8),
    islands: value.islands.filter((item): item is AutocompleteResult["islands"][number] =>
      isRecord(item) && isText(item.name) && isSlug(item.slug)
    ).slice(0, 4),
  };
}
