/**
 * What an imported directory listing may show as if the business said it.
 *
 * Most of the catalogue was imported from public data. The importer filled
 * several fields with generic values (a category label as the "headline",
 * a rating that is Google's, a place type for somewhere that is not a
 * business at all). These helpers decide how the pages present them.
 */

/** Ratings on imported listings are Google's. Same rule as server/listings-search.ts. */
export function listingRatingSource(typeData: { unclaimed?: unknown; source?: unknown } | null | undefined): "google" | "vakaygo" {
  return typeData?.unclaimed === true || typeData?.source === "google-places" ? "google" : "vakaygo";
}

/** "5.0 (208 Google reviews)" style suffix for compact cards; empty when there is no count. */
export function ratingCountLabel(reviewCount: number | null | undefined, source: "google" | "vakaygo"): string {
  if (!reviewCount || reviewCount <= 0) return source === "google" ? "Google" : "";
  return source === "google" ? `${reviewCount} Google` : String(reviewCount);
}

const WORD = /[\p{L}\p{N}]+/gu;
const PLACE_CONNECTORS = new Set(["the", "and", "of", "de", "la", "le", "du", "des", "del", "da", "y", "en", "&"]);

/** "Grenada", "St. Lucia", "St George's, Grenada", "Trinidad & Tobago": names only, nothing sentence-like. */
function looksLikePlaceName(text: string): boolean {
  if (!/^[\p{L}\p{N} .,&'’-]+$/u.test(text) || /[.,]$/.test(text)) return false;
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 12) return false;
  return tokens.every((token) => PLACE_CONNECTORS.has(token.toLowerCase()) || /^\p{Lu}/u.test(token));
}

/** "Boutique Stay", "Restaurant & Dining", "Bar": a Title Case category of at most four words. */
function looksLikeCategoryLabel(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.length >= 1 && tokens.length <= 4 && tokens.every((token) => token === "&" || /^\p{Lu}[\p{L}-]*$/u.test(token));
}

const squash = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * True for a headline the importer generated rather than a business wrote.
 * In November 2026 that was every one of the 8,024 unclaimed listings, in
 * two shapes:
 *
 *   "<category> in <place>"           Tours & activities in Grenada,
 *                                     Boutique Stay in Willemstad, Curaçao
 *   "Experience <title> in <place>"   Experience AKRA SPA in Santorini
 *
 * Shown as an italic pull-quote these read as something the business said.
 * A written headline has punctuation, a sentence, or more than a category
 * before the place ("Facials, massage, waxing and brow artistry in George
 * Town"; "Visit 4 places in one day. 8am-4pm").
 */
export function isGenericDirectoryHeadline(headline: string | null | undefined, title?: string | null): boolean {
  const text = (headline || "").trim();
  if (!text) return false;
  // "Experience <the listing's own title> in <place>"; the title may itself contain " in ".
  const own = squash(title || "");
  if (own && squash(text).startsWith(`experience ${own} in `)) return true;
  const match = /^(.+?)\s+in\s+(?:the\s+)?(.+)$/i.exec(text);
  if (!match) return false;
  // A Title Case category followed by an address fragment the importer pasted
  // in as-is ("Boutique Stay in West Bay 1401, Cayman Islands").
  if (looksLikeCategoryLabel(match[1]) && !/[!?;:]/.test(match[2]) && !/\.$/.test(match[2])) return true;
  if (!looksLikePlaceName(match[2])) return false;
  // The category part is a bare label: no sentence punctuation, a handful of words.
  if (/[.!?,;:]/.test(match[1])) return false;
  const lead = match[1].match(WORD) || [];
  return lead.length >= 1 && lead.length <= 6;
}

/** The headline to render as the business's own words, or null when the importer generated it. */
export function displayedHeadline(headline: string | null | undefined, title?: string | null): string | null {
  const text = (headline || "").trim();
  if (!text) return null;
  return isGenericDirectoryHeadline(text, title) ? null : text;
}

/**
 * Google place types that mean an organisation operates there. A listing
 * that has any of these is treated as a business even when it is also
 * tagged as a natural feature.
 */
const BUSINESS_PLACE_TYPES = new Set([
  "travel_agency", "tour_agency", "tour_operator", "store", "restaurant", "lodging", "food", "car_rental", "spa",
  "bar", "cafe", "night_club", "real_estate_agency", "marina", "school", "gym", "casino", "bakery", "shopping_mall",
  "amusement_park", "zoo", "aquarium", "museum", "art_gallery", "campground", "park", "church", "place_of_worship",
  "health", "clothing_store", "car_dealer", "airport", "transit_station", "parking", "laundry", "storage",
]);

/**
 * A beach, bay, waterfall or similar natural place that nobody runs: Google
 * tags it `natural_feature` and gives it no type an organisation would
 * have. Deliberately narrow. Parks and museums are NOT included: in this
 * data `park` also covers commercial adventure parks and botanical gardens
 * that a business can rightly claim.
 */
export function isNaturalPublicPlace(typeData: { googleTypes?: unknown } | null | undefined): boolean {
  const raw = typeData?.googleTypes;
  const types = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
  if (!types.includes("natural_feature")) return false;
  return !types.some((type) => BUSINESS_PLACE_TYPES.has(type));
}
