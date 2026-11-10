/**
 * Country gate for cold business invitations.
 *
 * `business_outreach_permission` records implied permission (a published business
 * address). That basis is not enough where the recipient's own law requires prior
 * opt-in for marketing email, including to businesses. This module is the single
 * place that decides which destinations a business-permission invitation may reach.
 * A recipient's recorded explicit opt-in is honoured everywhere.
 *
 * The defaults are deliberately conservative. Widening them is an owner decision:
 * a held country is released with OUTREACH_RELEASED_COUNTRIES; a prior-opt-in
 * country can only be changed here, in review.
 */

/** ISO 3166-1 alpha-2 code for every destination slug in the islands table (and its aliases). */
export const DESTINATION_COUNTRY_CODES: Record<string, string> = {
  "grenada": "GD",
  "barbados": "BB",
  "jamaica": "JM",
  "trinidad-and-tobago": "TT",
  "st-lucia": "LC",
  "antigua": "AG",
  "dominica": "DM",
  "bahamas": "BS",
  "aruba": "AW",
  "curacao": "CW",
  "dominican-republic": "DO",
  "turks-and-caicos": "TC",
  "cayman-islands": "KY",
  "bonaire": "BQ",
  "st-kitts": "KN",
  "martinique": "MQ",
  "guadeloupe": "GP",
  "usvi": "VI",
  "us-virgin-islands": "VI",
  "bvi": "VG",
  "british-virgin-islands": "VG",
  "puerto-rico": "PR",
  "st-vincent": "VC",
  "cartagena": "CO",
  "medellin": "CO",
  "cancun-riviera-maya": "MX",
  "los-cabos": "MX",
  "guanacaste": "CR",
  "ambergris-caye": "BZ",
  "santorini": "GR",
  "mykonos": "GR",
  "crete": "GR",
  "ibiza": "ES",
  "mallorca": "ES",
  "amalfi-coast-capri": "IT",
  "hvar-split": "HR",
};

/**
 * Prior opt-in regimes for unsolicited marketing email, including to businesses:
 * Greece (Law 3471/2006 art. 11), Spain (LSSI art. 21), Italy (Codice Privacy art. 130),
 * Croatia (Electronic Communications Act) and Costa Rica (Ley 8642 art. 44).
 * Only a recorded explicit opt-in may be used here. Not configurable at runtime.
 */
export const OUTREACH_PRIOR_OPT_IN_COUNTRIES: readonly string[] = ["GR", "ES", "IT", "HR", "CR"];

/**
 * Held until the owner releases them: Martinique and Guadeloupe (French law: B2B
 * prospecting needs French copy and a GDPR Art. 14 notice) and Colombia (Ley 1581/2012).
 */
export const OUTREACH_HELD_COUNTRIES: readonly string[] = ["MQ", "GP", "CO"];

/** US CAN-SPAM applies: the message must be identified as a solicitation. */
export const OUTREACH_SOLICITATION_NOTICE_COUNTRIES: readonly string[] = ["US", "PR", "VI"];

export type OutreachCountryStatus = "open" | "held" | "prior_opt_in" | "unknown";
export type OutreachPermissionRecord = { kind?: string | null; country?: string | null };

export function destinationCountryCode(islandSlug: string | null | undefined): string | null {
  return DESTINATION_COUNTRY_CODES[String(islandSlug || "").trim().toLowerCase()] ?? null;
}

/** Held countries the owner has explicitly released, from OUTREACH_RELEASED_COUNTRIES (comma-separated ISO codes). */
export function releasedOutreachCountries(raw: string | undefined = process.env.OUTREACH_RELEASED_COUNTRIES): string[] {
  return [...new Set(String(raw || "").split(",").map(value => value.trim().toUpperCase())
    .filter(code => OUTREACH_HELD_COUNTRIES.includes(code)))];
}

export function outreachCountryStatus(countryCode: string | null | undefined, released: readonly string[] = releasedOutreachCountries()): OutreachCountryStatus {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "unknown";
  if (OUTREACH_PRIOR_OPT_IN_COUNTRIES.includes(code)) return "prior_opt_in";
  if (OUTREACH_HELD_COUNTRIES.includes(code) && !released.includes(code)) return "held";
  return "open";
}

/** Country codes whose business-permission records cannot be used for a send right now. */
export function restrictedOutreachCountries(released: readonly string[] = releasedOutreachCountries()): string[] {
  return [...OUTREACH_PRIOR_OPT_IN_COUNTRIES, ...OUTREACH_HELD_COUNTRIES.filter(code => !released.includes(code))];
}

/**
 * Decide whether the recorded permissions allow an invitation to this destination.
 * An unknown destination fails closed. With no permission on file the decision is
 * left to the reservation gate, which reports the missing permission.
 */
export function evaluateOutreachCountryGate(input: {
  islandSlug: string;
  permissions?: readonly OutreachPermissionRecord[] | null;
  released?: readonly string[];
}): { allowed: boolean; reason?: "destination_country_unknown" | "country_requires_explicit_opt_in" | "country_on_hold"; country: string | null } {
  const released = input.released ?? releasedOutreachCountries();
  const country = destinationCountryCode(input.islandSlug);
  const permissions = (input.permissions || []).filter(record => record && typeof record.kind === "string");
  if (permissions.some(record => record.kind === "explicit_opt_in")) return { allowed: true, country };
  const destination = outreachCountryStatus(country, released);
  if (destination === "unknown") return { allowed: false, reason: "destination_country_unknown", country };
  if (destination === "prior_opt_in") return { allowed: false, reason: "country_requires_explicit_opt_in", country };
  if (destination === "held") return { allowed: false, reason: "country_on_hold", country };
  if (permissions.length === 0) return { allowed: true, country };
  // The destination is open: a business-permission record must not itself name a restricted country.
  const statuses = permissions.map(record => record.country ? outreachCountryStatus(record.country, released) : "open");
  if (statuses.some(status => status === "open")) return { allowed: true, country };
  return { allowed: false, reason: statuses.includes("prior_opt_in") ? "country_requires_explicit_opt_in" : "country_on_hold", country };
}

/** Destination slugs split by what kind of permission may be used there. */
export function outreachDestinationSlugs(released: readonly string[] = releasedOutreachCountries()): { open: string[]; optInOnly: string[] } {
  const open: string[] = [], optInOnly: string[] = [];
  for (const [slug, code] of Object.entries(DESTINATION_COUNTRY_CODES)) {
    (outreachCountryStatus(code, released) === "open" ? open : optInOnly).push(slug);
  }
  return { open, optInOnly };
}

export function requiresSolicitationNotice(islandSlug: string): boolean {
  const code = destinationCountryCode(islandSlug);
  return !!code && OUTREACH_SOLICITATION_NOTICE_COUNTRIES.includes(code);
}
