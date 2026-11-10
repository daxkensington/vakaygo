/**
 * Where a verification text may be sent.
 *
 * A traveler types the number, so without a list any signed-in account could
 * make the site text premium-rate or high-cost ranges anywhere in the world
 * ("SMS pumping"). The list is the calling codes of the destinations VakayGo
 * lists and of the countries its travelers come from. A number outside it is
 * refused before a code is reserved; a traveler from elsewhere can still use
 * the site, just without a verified phone.
 */
const ALLOWED_CALLING_CODES: readonly string[] = [
  "1",   // United States, Canada and the NANP Caribbean (Jamaica, Bahamas, Barbados, Grenada, …)
  "44",  // United Kingdom
  "353", // Ireland
  "33", "590", "596", "594", // France, Guadeloupe / St Martin / St Barts, Martinique, French Guiana
  "31", "297", "599", "597", // Netherlands, Aruba, Curaçao / Bonaire, Suriname
  "49", "43", "41", "32", "352", // Germany, Austria, Switzerland, Belgium, Luxembourg
  "34", "351", "39", "30", "385", "356", "357", // Spain, Portugal, Italy, Greece, Croatia, Malta, Cyprus
  "45", "46", "47", "358", // Denmark, Sweden, Norway, Finland
  "52", "57", "506", "501", "507", // Mexico, Colombia, Costa Rica, Belize, Panama
  "55", "54", "56", "51", // Brazil, Argentina, Chile, Peru
  "61", "64", // Australia, New Zealand
];

/** NANP area codes that are premium-rate or not ordinary subscriber lines. */
const BLOCKED_NANP_AREA_CODES: ReadonlySet<string> = new Set(["900", "976", "500", "700"]);

const BY_LENGTH = [...ALLOWED_CALLING_CODES].sort((a, b) => b.length - a.length);

/** The allowed calling code a number starts with, or null. Expects E.164 (`+` and 8–15 digits). */
export function smsDestinationCallingCode(phone: unknown): string | null {
  if (typeof phone !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(phone)) return null;
  const digits = phone.slice(1);
  const code = BY_LENGTH.find((candidate) => digits.startsWith(candidate)) ?? null;
  if (code === "1") {
    // +1 numbers are exactly ten digits after the country code.
    if (digits.length !== 11) return null;
    const area = digits.slice(1, 4);
    if (BLOCKED_NANP_AREA_CODES.has(area) || /^[01]/.test(area)) return null;
  }
  return code;
}

export function isAllowedSmsDestination(phone: unknown): phone is string {
  return smsDestinationCallingCode(phone) !== null;
}
