/**
 * Timezone-aware Quiet Hours & Business Hours Guard for VakayGo Outreach & Marketing Emails.
 *
 * Enforces that non-transactional outreach, partner onboarding, price-alert, and
 * abandoned-booking recovery emails are ONLY sent between 08:30 and 19:30 (8:30 AM – 7:30 PM)
 * in the recipient's / destination's local time zone.
 */

export const QUIET_HOURS_START_MINUTES = 8 * 60 + 30; // 08:30 local time
export const QUIET_HOURS_END_MINUTES = 19 * 60 + 30;  // 19:30 (7:30 PM) local time

/**
 * Exact IANA time zone for every VakayGo destination slug (all 34 global Sun & Sea destinations
 * plus regional aliases).
 */
export const DESTINATION_TIMEZONES: Record<string, string> = {
  // Mediterranean (Europe)
  "santorini": "Europe/Athens",
  "mykonos": "Europe/Athens",
  "crete": "Europe/Athens",
  "mallorca": "Europe/Madrid",
  "ibiza": "Europe/Madrid",
  "amalfi-coast": "Europe/Rome",
  "amalfi-coast-capri": "Europe/Rome",
  "hvar-split": "Europe/Zagreb",

  // Latin America (Mexico, Belize, Costa Rica, Colombia)
  "tulum": "America/Cancun",
  "cancun": "America/Cancun",
  "cancun-riviera-maya": "America/Cancun",
  "los-cabos": "America/Mazatlan",
  "puerto-vallarta": "America/Mexico_City",
  "ambergris-caye": "America/Belize",
  "guanacaste": "America/Costa_Rica",
  "cartagena": "America/Bogota",
  "medellin": "America/Bogota",

  // Western Caribbean (UTC-5 / EST-EDT)
  "jamaica": "America/Jamaica",
  "cayman-islands": "America/Cayman",
  "bahamas": "America/Nassau",
  "turks-and-caicos": "America/Grand_Turk",

  // Greater & Lesser Antilles / Southern Caribbean (UTC-4 AST)
  "dominican-republic": "America/Santo_Domingo",
  "puerto-rico": "America/Puerto_Rico",
  "us-virgin-islands": "America/St_Thomas",
  "british-virgin-islands": "America/Tortola",
  "anguilla": "America/Anguilla",
  "st-martin": "America/Lower_Princes",
  "sint-maarten": "America/Lower_Princes",
  "st-barts": "America/St_Barthelemy",
  "antigua-and-barbuda": "America/Antigua",
  "st-kitts-and-nevis": "America/St_Kitts",
  "montserrat": "America/Montserrat",
  "guadeloupe": "America/Guadeloupe",
  "dominica": "America/Dominica",
  "martinique": "America/Martinique",
  "st-lucia": "America/St_Lucia",
  "st-vincent-and-the-grenadines": "America/St_Vincent",
  "barbados": "America/Barbados",
  "grenada": "America/Grenada",
  "trinidad-and-tobago": "America/Port_of_Spain",
  "aruba": "America/Aruba",
  "curacao": "America/Curacao",
  "bonaire": "America/Kralendijk",
};

/**
 * Fallback mapping by country name or ISO-2 code.
 */
const COUNTRY_TIMEZONES: Record<string, string> = {
  // Mediterranean & Europe
  "greece": "Europe/Athens",
  "gr": "Europe/Athens",
  "spain": "Europe/Madrid",
  "es": "Europe/Madrid",
  "italy": "Europe/Rome",
  "it": "Europe/Rome",
  "croatia": "Europe/Zagreb",
  "hr": "Europe/Zagreb",
  "france": "Europe/Paris",
  "fr": "Europe/Paris",
  "united kingdom": "Europe/London",
  "gb": "Europe/London",
  "uk": "Europe/London",
  "germany": "Europe/Berlin",
  "de": "Europe/Berlin",
  "netherlands": "Europe/Amsterdam",
  "nl": "Europe/Amsterdam",

  // Latin America
  "mexico": "America/Cancun",
  "mx": "America/Cancun",
  "belize": "America/Belize",
  "bz": "America/Belize",
  "costa rica": "America/Costa_Rica",
  "cr": "America/Costa_Rica",
  "colombia": "America/Bogota",
  "co": "America/Bogota",

  // Caribbean & North America
  "jamaica": "America/Jamaica",
  "jm": "America/Jamaica",
  "cayman islands": "America/Cayman",
  "ky": "America/Cayman",
  "bahamas": "America/Nassau",
  "bs": "America/Nassau",
  "turks & caicos": "America/Grand_Turk",
  "turks and caicos": "America/Grand_Turk",
  "tc": "America/Grand_Turk",
  "dominican republic": "America/Santo_Domingo",
  "do": "America/Santo_Domingo",
  "puerto rico": "America/Puerto_Rico",
  "pr": "America/Puerto_Rico",
  "u.s. virgin islands": "America/St_Thomas",
  "us virgin islands": "America/St_Thomas",
  "vi": "America/St_Thomas",
  "british virgin islands": "America/Tortola",
  "vg": "America/Tortola",
  "anguilla": "America/Anguilla",
  "ai": "America/Anguilla",
  "sint maarten": "America/Lower_Princes",
  "st. martin": "America/Lower_Princes",
  "sx": "America/Lower_Princes",
  "mf": "America/Lower_Princes",
  "st. barts": "America/St_Barthelemy",
  "bl": "America/St_Barthelemy",
  "antigua & barbuda": "America/Antigua",
  "antigua and barbuda": "America/Antigua",
  "ag": "America/Antigua",
  "st. kitts & nevis": "America/St_Kitts",
  "st. kitts and nevis": "America/St_Kitts",
  "kn": "America/St_Kitts",
  "dominica": "America/Dominica",
  "dm": "America/Dominica",
  "st. lucia": "America/St_Lucia",
  "lc": "America/St_Lucia",
  "st. vincent & the grenadines": "America/St_Vincent",
  "st. vincent and the grenadines": "America/St_Vincent",
  "vc": "America/St_Vincent",
  "barbados": "America/Barbados",
  "bb": "America/Barbados",
  "grenada": "America/Grenada",
  "gd": "America/Grenada",
  "trinidad & tobago": "America/Port_of_Spain",
  "trinidad and tobago": "America/Port_of_Spain",
  "tt": "America/Port_of_Spain",
  "aruba": "America/Aruba",
  "aw": "America/Aruba",
  "curacao": "America/Curacao",
  "curaçao": "America/Curacao",
  "cw": "America/Curacao",
  "bonaire": "America/Kralendijk",
  "bq": "America/Kralendijk",
  "united states": "America/New_York",
  "us": "America/New_York",
  "canada": "America/Toronto",
  "ca": "America/Toronto",
};

/**
 * Fallback mapping by email ccTLD when only an email address is known.
 */
const EMAIL_TLD_TIMEZONES: Record<string, string> = {
  "gr": "Europe/Athens",
  "es": "Europe/Madrid",
  "it": "Europe/Rome",
  "hr": "Europe/Zagreb",
  "fr": "Europe/Paris",
  "de": "Europe/Berlin",
  "nl": "Europe/Amsterdam",
  "uk": "Europe/London",
  "mx": "America/Mexico_City",
  "bz": "America/Belize",
  "cr": "America/Costa_Rica",
  "jm": "America/Jamaica",
  "ky": "America/Cayman",
  "bs": "America/Nassau",
  "tc": "America/Grand_Turk",
  "do": "America/Santo_Domingo",
  "pr": "America/Puerto_Rico",
  "ag": "America/Antigua",
  "kn": "America/St_Kitts",
  "dm": "America/Dominica",
  "lc": "America/St_Lucia",
  "vc": "America/St_Vincent",
  "bb": "America/Barbados",
  "gd": "America/Grenada",
  "tt": "America/Port_of_Spain",
  "aw": "America/Aruba",
  "cw": "America/Curacao",
};

export interface RecipientWindowInput {
  islandSlug?: string | null;
  country?: string | null;
  email?: string | null;
  timeZoneOverride?: string | null;
}

export interface RecipientWindowResult {
  allowed: boolean;
  timeZone: string;
  localHour: number;
  localMinute: number;
  localTimeFormatted: string;
  allowedWindow: string;
}

/**
 * Resolve the IANA timezone for a destination, country, or email address.
 * Defaults to "America/New_York" if no specific region is matched.
 */
export function resolveRecipientTimeZone(input: RecipientWindowInput): string {
  if (input.timeZoneOverride) {
    return input.timeZoneOverride;
  }

  if (input.islandSlug) {
    const slug = input.islandSlug.trim().toLowerCase();
    if (DESTINATION_TIMEZONES[slug]) {
      return DESTINATION_TIMEZONES[slug];
    }
  }

  if (input.country) {
    const key = input.country.trim().toLowerCase();
    if (COUNTRY_TIMEZONES[key]) {
      return COUNTRY_TIMEZONES[key];
    }
  }

  if (input.email && input.email.includes("@")) {
    const domain = input.email.trim().toLowerCase().split("@")[1] || "";
    const parts = domain.split(".");
    const tld = parts[parts.length - 1] || "";
    if (EMAIL_TLD_TIMEZONES[tld]) {
      return EMAIL_TLD_TIMEZONES[tld];
    }
  }

  return "America/New_York";
}

/**
 * Extract local hour (0-23) and minute (0-59) in the target IANA timezone.
 */
export function getLocalHourAndMinute(now: Date, timeZone: string): { hour: number; minute: number; formatted: string } {
  let effectiveZone = timeZone;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: effectiveZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
  } catch {
    effectiveZone = "America/New_York";
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: effectiveZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
  }

  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const formatted = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return { hour, minute, formatted };
}

/**
 * Checks whether `now` falls within the allowed daytime business-hours window
 * (08:30 to 19:30 local time) for the recipient's destination/timezone.
 */
export function checkRecipientSendingWindow(
  input: RecipientWindowInput,
  now: Date = new Date()
): RecipientWindowResult {
  const timeZone = resolveRecipientTimeZone(input);
  const { hour, minute, formatted } = getLocalHourAndMinute(now, timeZone);
  const totalMinutes = hour * 60 + minute;

  const allowed =
    totalMinutes >= QUIET_HOURS_START_MINUTES &&
    totalMinutes < QUIET_HOURS_END_MINUTES;

  return {
    allowed,
    timeZone,
    localHour: hour,
    localMinute: minute,
    localTimeFormatted: formatted,
    allowedWindow: "08:30–19:30",
  };
}
