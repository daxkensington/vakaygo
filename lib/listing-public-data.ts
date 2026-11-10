/**
 * Public directory/AI responses must obey the same pre-booking contact gate.
 *
 * `listings.type_data` also holds what the import and outreach pipelines know
 * about a business: scraped and alternate email addresses, where and when a
 * contact was found, social profiles, Google identifiers, sweep bookkeeping.
 * None of that belongs in a public response, and a new pipeline field must not
 * become public by default. So this is an allowlist: a key is served only when
 * a public page or the concierge actually renders it.
 */
const PUBLIC_TYPE_DATA_KEYS: ReadonlySet<string> = new Set([
  // Opening hours and what kind of place it is
  "hours", "category", "cuisineType", "cuisine", "cuisines", "serves", "menu", "priceLevel",
  // Stays
  "amenities", "facilities", "propertyType", "property_type", "bedrooms", "bathrooms", "maxGuests",
  // Tours, excursions, events
  "includes", "included", "excluded", "itinerary", "duration", "durationMinutes", "isMultiDay",
  "meetingPoint", "groupSize", "maxGroupSize", "languages", "difficulty",
  // Live booking signals shown on bookable listings
  "bookingCount7Days", "spotsRemaining",
  // Whether a business has claimed the page
  "unclaimed",
]);

/** The one provenance value pages read: it labels a rating as Google's. */
const PUBLIC_SOURCES: ReadonlySet<string> = new Set(["google-places"]);

export function publicListingTypeData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (PUBLIC_TYPE_DATA_KEYS.has(key)) copy[key] = source[key];
  }
  if (typeof source.source === "string" && PUBLIC_SOURCES.has(source.source)) copy.source = source.source;
  return copy;
}
