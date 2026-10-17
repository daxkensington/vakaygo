import { DURATION_OPTIONS, LISTING_TYPES, type DurationOption, type ListingType } from "@/lib/listing-filters";
import { stemTerm } from "@/lib/search-terms";

const DESTINATIONS: Record<string, string> = {
  grenada: "Grenada", barbados: "Barbados", jamaica: "Jamaica", "st-lucia": "St. Lucia", "trinidad-and-tobago": "Trinidad and Tobago", antigua: "Antigua", dominica: "Dominica", bahamas: "Bahamas", aruba: "Aruba", curacao: "Curaçao", "cayman-islands": "Cayman Islands", "puerto-rico": "Puerto Rico", "dominican-republic": "Dominican Republic", "turks-and-caicos": "Turks and Caicos", "us-virgin-islands": "US Virgin Islands", "british-virgin-islands": "British Virgin Islands", "st-kitts": "St. Kitts", martinique: "Martinique", guadeloupe: "Guadeloupe", bonaire: "Bonaire", "st-vincent": "St. Vincent", cartagena: "Cartagena", medellin: "Medellín", "cancun-riviera-maya": "Cancún and Riviera Maya", "los-cabos": "Los Cabos", guanacaste: "Guanacaste", "ambergris-caye": "Ambergris Caye", santorini: "Santorini", mykonos: "Mykonos", crete: "Crete", ibiza: "Ibiza", mallorca: "Mallorca", "amalfi-coast-capri": "Amalfi Coast and Capri", "hvar-split": "Hvar and Split",
};
const AMENITIES = ["wifi", "pool", "ac", "kitchen", "parking", "beach-access", "ocean-view", "pet-friendly"] as const;
const TYPE_LABELS: Record<ListingType, string> = { stay: "stays", tour: "tours", dining: "dining", event: "events", transport: "transport", guide: "guides", excursion: "excursions", transfer: "transfers", vip: "VIP experiences", spa: "spas" };
export const VISITOR_FACTS_UNKNOWN = "Current admission fees, visitor access, opening hours and reservation requirements are unconfirmed. Check an official visitor source before going.";
export const SMART_SEARCH_SYSTEM_PROMPT = `Parse a natural-language VakayGo directory search into structured filters. Return ONLY JSON with a filters object; do not add summaries, suggestions or venue facts.
Allowed fields: type, island, q, minPrice, maxPrice, minRating, guests, amenities, duration.
type: ${LISTING_TYPES.join(", ")}.
island: ${Object.keys(DESTINATIONS).join(", ")}.
q: the key subject/activity, using words from the user's query; omit conversational filler.
minPrice/maxPrice: numeric requested budget floor/ceiling in USD, never venue admission fees. Cheap/budget may map to a ceiling around50–100; luxury/premium may map to a floor200.
minRating: requested minimum from0–5; best/top-rated may map to4.5.
guests: requested integer group size1–100.
amenities: selected values from ${AMENITIES.join(", ")}.
duration: ${DURATION_OPTIONS.join(", ")}.
Only include indicated filters. Filters express search intent, not confirmed access, hours, admission or availability.
Example: romantic dinner with ocean view in Grenada -> {"filters":{"type":"dining","island":"grenada","q":"romantic ocean view","amenities":["ocean-view"]}}.
Example: cheap hotels with pool in Jamaica -> {"filters":{"type":"stay","island":"jamaica","q":"hotels","maxPrice":100,"amenities":["pool"]}}.`;

export type AiSearchFilters = {
  type?: ListingType; island?: string; q?: string; minPrice?: number; maxPrice?: number; minRating?: number; guests?: number; amenities?: string[]; duration?: DurationOption;
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function parseSearchCompletion(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); }
  catch { return null; }
}
function numeric(value: unknown, min: number, max: number, integer = false): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isSafeInteger(n)) ? n : undefined;
}
const words = (value: string) => value.match(/[\p{L}\p{N}]+/gu) ?? [];
const term = (value: string) => stemTerm(value.normalize("NFKD").replace(/\p{M}/gu, ""));

/** Model keywords may select user words, not introduce new narrative. */
function groundedQuery(candidate: unknown, query: string): string | undefined {
  const userWords = words(query);
  if (typeof candidate !== "string") return undefined;
  const requested = new Set(words(candidate.slice(0, 400)).map(term));
  const selected = [...new Set(userWords.filter(word => requested.has(term(word))))].slice(0, 12).join(" ").slice(0, 120);
  return selected || undefined;
}

export function validateAiSearchFilters(parsed: unknown, query: string): AiSearchFilters {
  const source = object(parsed) && object(parsed.filters) ? parsed.filters : object(parsed) ? parsed : {};
  const filters: AiSearchFilters = {};
  if (typeof source.type === "string" && LISTING_TYPES.includes(source.type as ListingType)) filters.type = source.type as ListingType;
  if (typeof source.island === "string" && Object.hasOwn(DESTINATIONS, source.island)) filters.island = source.island;
  for (const field of ["minPrice", "maxPrice", "minRating", "guests"] as const) {
    const value = numeric(source[field], field === "guests" ? 1 : 0, field === "guests" ? 100 : field === "minRating" ? 5 : 1_000_000, field === "guests");
    if (value !== undefined) filters[field] = value;
  }
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) { delete filters.minPrice; delete filters.maxPrice; }
  if (Array.isArray(source.amenities)) {
    const amenities = [...new Set(source.amenities.filter((value): value is string => typeof value === "string" && AMENITIES.includes(value as typeof AMENITIES[number])))];
    if (amenities.length) filters.amenities = amenities;
  }
  if (typeof source.duration === "string" && DURATION_OPTIONS.includes(source.duration as DurationOption)) filters.duration = source.duration as DurationOption;
  const q = groundedQuery(source.q, query);
  if (q) filters.q = q;
  // Invalid/non-JSON completions recover as a normal bounded user search.
  if (!object(parsed)) filters.q = words(query).slice(0, 12).join(" ").slice(0, 120) || undefined;
  return filters;
}

export function renderAiSearchResponse(filters: AiSearchFilters) {
  const type = filters.type ? TYPE_LABELS[filters.type] : "listings";
  const destination = filters.island ? DESTINATIONS[filters.island] : undefined;
  const summary = `Search intent: directory ${type}${destination ? ` in ${destination}` : " across supported destinations"}. ${VISITOR_FACTS_UNKNOWN}`;
  const choices: ListingType[] = filters.type ? [filters.type, ...(["stay", "tour", "dining", "transport"] as ListingType[]).filter(type => type !== filters.type)].slice(0, 3) : ["stay", "tour", "dining"];
  const suggestions = choices.map(type => `Find ${TYPE_LABELS[type]}${destination ? ` in ${destination}` : ""}`);
  return { filters, summary, suggestions };
}

/** Counts, titles, prices and model prose supplied by a browser are not authoritative facts. */
export function renderAiResultsSummary(parsed: unknown): string {
  const focus = object(parsed) ? parsed.focus : null;
  const guidance = focus === "refine" ? "Try adjusting the destination, category or keywords to refine your directory search."
    : focus === "compare" ? "Compare the published directory details below while planning."
    : "Review the directory results below while planning.";
  return `${guidance} ${VISITOR_FACTS_UNKNOWN}`;
}

export function untrustedSearchResultContext(value: unknown): string {
  if (!Array.isArray(value)) return "none";
  return JSON.stringify(value.slice(0, 5).filter(object).map(row => ({
    title: typeof row.title === "string" ? row.title.slice(0, 120) : "",
    type: typeof row.type === "string" && LISTING_TYPES.includes(row.type as ListingType) ? row.type : "listing",
  })));
}

/** One existing platform35s budget includes provider headers and response bodies. */
export async function withAiSearchDeadline<T>(requestSignal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(35000)]);
  signal.throwIfAborted();
  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener("abort", onAbort, { once: true }); });
  try { return await Promise.race([operation(signal), aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
