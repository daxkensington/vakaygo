/**
 * Listing titles and descriptions for search results.
 *
 * - The title keeps the business name (the query word) first, adds the place,
 *   and promises only what the page has: "Menu" only with a menu, never
 *   "Reviews" (the rating shown is Google's). Aim for about 65 characters.
 * - Imported descriptions carry two machine sentences: Google's rating restated
 *   as prose, and a pitch telling the owner to claim the listing. Neither
 *   describes the business, so both are removed at render time.
 */

const TYPE_HOOKS: Record<string, string> = {
  stay: "Photos, Amenities & Location",
  excursion: "Activity Details & Photos",
  tour: "Tour Details & Photos",
  spa: "Services, Hours & Location",
  transport: "Rentals, Contact & Location",
  transfer: "Transfer Details & Location",
  event: "Event Details & Location",
  vip: "Services & Location",
  guide: "Guide Details & Location",
};

export function listingTitleHook(type: string, options: { hasMenu?: boolean } = {}): string {
  if (type === "dining") return options.hasMenu ? "Menu, Hours & Location" : "Hours, Photos & Location";
  return TYPE_HOOKS[type] || "Details, Photos & Location";
}

/** Folds the spellings one place goes by: accents, punctuation, "and"/"&", "St"/"St."/"Saint". */
export function placeKey(value: string): string {
  return value
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bsaint\b|\bst\b\.?/g, "st")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Roseau, Dominica" → "Roseau, Dominica"; "St. Lucia" on St Lucia → "St Lucia"; never the destination twice. */
export function cleanLocationLabel(parish: string | null | undefined, islandName: string): string {
  const island = islandName.trim();
  if (!parish || !parish.trim()) return island;
  const islandKey = placeKey(island);
  const parts = parish.split(",").map(part => part.trim()).filter(Boolean)
    .filter(part => {
      const key = placeKey(part);
      // Drop the destination itself and fragments of it ("and Barbuda").
      return key && key !== islandKey && !islandKey.includes(key) && !key.includes(islandKey);
    });
  return parts.length ? `${parts.join(", ")}, ${island}` : island;
}

const TITLE_TARGET = 65;

/** Business name first; then the place; then the hook, each only while it fits. */
export function buildListingTitle(name: string, location: string, hook: string): string {
  const title = name.replace(/\s+/g, " ").trim();
  const full = `${title} (${location}) — ${hook}`;
  if (full.length <= TITLE_TARGET) return full;
  const placed = `${title}, ${location}`;
  if (placed.length <= TITLE_TARGET) return placed;
  return title;
}

const TEMPLATED_SENTENCES = [
  // "Highly regarded by visitors with a 4.6/5 rating across 120 reviews."
  /\s*Highly regarded by visitors with a [0-9.]+\/5 rating across [0-9,]+ reviews?\.?/gi,
  // "Claim this listing on VakayGo to manage availability, photos, and direct bookings with 0% guest fees."
  /\s*Claim this listing on VakayGo to manage [^.]*\./gi,
];

/** The description without the restated Google rating and the claim pitch. Everything else is kept. */
export function stripTemplatedDescription(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const pattern of TEMPLATED_SENTENCES) out = out.replace(pattern, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
