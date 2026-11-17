/**
 * Listing and hub titles and descriptions for search results.
 *
 * - The title keeps the business name (the query word) first, adds the place,
 *   and promises what searchers look for: "Menu, Hours & Location" on dining
 *   listings with a menu as well as bars, lounges, and beach clubs; "Location,
 *   Map & Photos" on public beaches and natural landmarks; never "Reviews"
 *   (the rating shown is Google's). Aim for about 65 characters.
 * - Imported descriptions carry two machine sentences: Google's rating restated
 *   as prose, and a pitch telling the owner to claim the listing. Neither
 *   describes the business, so both are removed at render time.
 */

import { displayedHeadline, isNaturalPublicPlace } from "@/lib/listing-display";

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

export type ListingSeoOptions = {
  hasMenu?: boolean;
  name?: string | null;
  category?: string | null;
  cuisineType?: string | null;
  googleTypes?: unknown;
};

const NON_BAR_TYPES = new Set(["stay", "spa", "transport", "transfer", "guide"]);
const TOUR_ACTIVITY_WORDS =
  /\b(tour|tours|excursion|excursions|charter|charters|cruise|cruises|crawl|hop|hopping|transfer|pass)\b/i;
const TOUR_LOUNGE_VENUE_WORDS =
  /\b(beach\s+club|day\s+club|day\s+lounge|rooftop\s+lounge|cocktail\s+lounge)\b/i;
const BAR_LOUNGE_NAME_WORDS =
  /\b(bar|bars|lounge|lounges|beach\s+club|day\s+club|nightclub|night\s+club|pub|gastropub|tavern|taproom|cantina|tiki|rooftop)\b/i;
const BAR_LOUNGE_CATEGORY_WORDS =
  /\b(bar|bars|lounge|beach[\s_]+club|night[\s_]*club|pub|gastropub|cocktail|tavern|cantina)\b/i;

const BEACH_LANDMARK_WORDS = /\b(beach|beaches|bay|cove|waterfall|falls)\b/i;
const COMMERCIAL_OR_TOUR_WORDS =
  /\b(tour|tours|charter|charters|cruise|cruises|safari|adventure|adventures|excursion|excursions|watersports|dive|diving|snorkel|snorkeling|kayak|jet\s*ski|parasail|horseback|atv|buggy|bar|bars|lounge|club|grill|kitchen|restaurant|cafe|bistro|hotel|resort|villa|bungalow|inn|suite|suites|apartment|apartments|condo|cottage|lodge|spa|rental|rentals|taxi|transfer)\b/i;

export function isBarLoungeOrBeachClub(type: string, options: ListingSeoOptions = {}): boolean {
  if (NON_BAR_TYPES.has(type)) return false;
  const name = (options.name || "").trim();
  if (type === "tour" || type === "excursion") {
    return Boolean(name) && TOUR_LOUNGE_VENUE_WORDS.test(name) && !TOUR_ACTIVITY_WORDS.test(name);
  }
  if (name && BAR_LOUNGE_NAME_WORDS.test(name)) return true;
  if (options.category && BAR_LOUNGE_CATEGORY_WORDS.test(options.category)) return true;
  if (options.cuisineType && BAR_LOUNGE_CATEGORY_WORDS.test(options.cuisineType)) return true;
  if (Array.isArray(options.googleTypes)) {
    return options.googleTypes.some((t) => t === "bar" || t === "night_club");
  }
  return false;
}

export function isBeachOrNaturalPlace(type: string, options: ListingSeoOptions = {}): boolean {
  if (isNaturalPublicPlace({ googleTypes: options.googleTypes })) return true;
  if (["stay", "dining", "spa", "transport", "transfer", "vip", "event"].includes(type)) return false;
  if (isBarLoungeOrBeachClub(type, options)) return false;
  const name = (options.name || "").trim();
  if (!name) return false;
  return BEACH_LANDMARK_WORDS.test(name) && !COMMERCIAL_OR_TOUR_WORDS.test(name);
}

export function listingTitleHook(type: string, options: ListingSeoOptions = {}): string {
  if (options.hasMenu || isBarLoungeOrBeachClub(type, options)) {
    return "Menu, Hours & Location";
  }
  if (isBeachOrNaturalPlace(type, options)) {
    return "Location, Map & Photos";
  }
  if (type === "dining") return "Hours, Photos & Location";
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

const COMPACT_HOOKS: Record<string, string> = {
  "Menu, Hours & Location": "Menu & Hours",
  "Hours, Photos & Location": "Hours & Photos",
  "Photos, Amenities & Location": "Photos & Amenities",
  "Activity Details & Photos": "Details & Photos",
  "Tour Details & Photos": "Tours & Photos",
  "Services, Hours & Location": "Services & Hours",
  "Rentals, Contact & Location": "Rentals & Contact",
  "Transfer Details & Location": "Transfer Details",
  "Event Details & Location": "Event Details",
  "Services & Location": "Services",
  "Guide Details & Location": "Guide Details",
  "Details, Photos & Location": "Details & Photos",
  "Location, Map & Photos": "Location & Map",
};

export function compactListingHook(hook: string): string {
  return COMPACT_HOOKS[hook] || hook.replace(/,\s*Location$/i, "").replace(/\s*&\s*Location$/i, "").trim() || hook;
}

/** Business name first; then the place; then the hook, shedding verbosity before losing the hook. */
export function buildListingTitle(name: string, location: string, hook: string): string {
  const title = name.replace(/\s+/g, " ").trim();
  const full = `${title} (${location}) — ${hook}`;
  if (full.length <= TITLE_TARGET) return full;

  const shortHook = compactListingHook(hook);
  const compact = `${title} (${location}) — ${shortHook}`;
  if (compact.length <= TITLE_TARGET) return compact;

  const commaIdx = location.lastIndexOf(", ");
  const destinationOnly = commaIdx >= 0 ? location.slice(commaIdx + 2).trim() : "";
  if (destinationOnly) {
    const destFull = `${title} (${destinationOnly}) — ${hook}`;
    if (destFull.length <= TITLE_TARGET) return destFull;
    const destCompact = `${title} (${destinationOnly}) — ${shortHook}`;
    if (destCompact.length <= TITLE_TARGET) return destCompact;
  }

  const placed = `${title}, ${location}`;
  if (placed.length <= TITLE_TARGET) return placed;
  if (destinationOnly) {
    const destPlaced = `${title}, ${destinationOnly}`;
    if (destPlaced.length <= TITLE_TARGET) return destPlaced;
  }
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

export function clipMetaDescription(raw: string, maxLength = 158): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized
    .slice(0, maxLength - 3)
    .replace(/\s+\S*$/, "")
    .replace(/[,;:.\s]+$/, "")}…`;
}

export type ListingDescriptionInput = {
  name: string;
  type: string;
  typeLabel?: string;
  location: string;
  hook: string;
  metaDescription?: string | null;
  description?: string | null;
  headline?: string | null;
  options?: ListingSeoOptions;
};

/**
 * Meta description for a listing page (<= 158 chars).
 * Strips machine-generated rating/claim prose and ignores generic importer
 * category headlines ("Restaurant & Dining in Nassau"), falling back to a
 * clear, intent-aligned snippet when no real business copy exists.
 */
export function buildListingDescription(input: ListingDescriptionInput): string {
  const cleanName = input.name.replace(/\s+/g, " ").trim();
  const custom =
    stripTemplatedDescription(input.metaDescription) ||
    stripTemplatedDescription(input.description) ||
    displayedHeadline(input.headline, cleanName);
  if (custom) return clipMetaDescription(custom);

  const opts: ListingSeoOptions = { ...input.options, name: input.options?.name ?? cleanName };
  if (isBeachOrNaturalPlace(input.type, opts)) {
    return clipMetaDescription(
      `Where is ${cleanName}? View location, map, directions, and photos in ${input.location} on VakayGo.`,
    );
  }
  if (input.hook === "Menu, Hours & Location") {
    return clipMetaDescription(
      `${cleanName} in ${input.location} — menu, opening hours, photos, and location details on VakayGo.`,
    );
  }
  const label = (input.typeLabel || "listing").toLowerCase();
  return clipMetaDescription(
    `${cleanName} in ${input.location} — ${input.hook.toLowerCase()} for this ${label} on VakayGo.`,
  );
}

const HUB_TITLE_TARGET = 60;

export function buildDestinationHubTitle(name: string, country?: string | null): string {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const cleanCountry = country?.replace(/\s+/g, " ").trim() || "";
  const countryLabel =
    cleanCountry && placeKey(cleanCountry) !== placeKey(cleanName) ? `, ${cleanCountry}` : "";
  const candidates = [
    `${cleanName}${countryLabel} — Stays, Tours & Dining | VakayGo`,
    `${cleanName} — Stays, Tours & Dining | VakayGo`,
    `${cleanName} — Stays, Tours & Dining`,
    `${cleanName} Travel Guide | VakayGo`,
  ];
  for (const candidate of candidates) {
    if (candidate.length <= HUB_TITLE_TARGET) return candidate;
  }
  return cleanName;
}

export function buildTopicHubTitle(
  prefix: string,
  islandName: string,
  year: number,
  suffix: string,
): string {
  const cleanName = islandName.replace(/\s+/g, " ").trim();
  const candidates = [
    `${prefix} in ${cleanName} (${year}) — ${suffix} | VakayGo`,
    `${prefix} in ${cleanName} (${year}) — ${suffix}`,
    `${prefix} in ${cleanName} (${year}) | VakayGo`,
    `${prefix} in ${cleanName} (${year})`,
    `${prefix} in ${cleanName}`,
  ];
  for (const candidate of candidates) {
    if (candidate.length <= HUB_TITLE_TARGET) return candidate;
  }
  return `${prefix} in ${cleanName}`;
}
