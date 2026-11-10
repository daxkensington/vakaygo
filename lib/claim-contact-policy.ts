/**
 * When may a business claim be verified automatically?
 *
 * Automatic verification proves that the claimant controls a contact point
 * recorded for the listing: its phone number, its published email address, or
 * a mailbox on its own domain. That only proves who runs THIS listing when the
 * contact point belongs to this listing alone. The directory holds hundreds of
 * listings that share one: resort outlets on the resort's switchboard, tour
 * operators filed under an aggregator's phone and website, chain properties on
 * the brand's domain. Whoever answers a shared contact could otherwise claim
 * every listing on it, including businesses run by other companies.
 *
 * So a shared contact never verifies a claim automatically. Those claims go
 * to team review, where a person checks the claimant against the business.
 */

/** Mailbox providers: an address here says nothing about any business domain. */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "zoho.com", "gmx.com", "mail.com", "yandex.com", "vakaygo.com",
]);

/**
 * Domains that host or front many unrelated businesses: booking platforms,
 * site builders, social networks and hotel brands whose properties are run by
 * separate franchisees. A mailbox on one of these never proves ownership of a
 * particular listing, however few listings currently point at it.
 */
const SHARED_HOST_DOMAINS: readonly string[] = [
  // Booking and review platforms
  "booking.com", "airbnb.com", "vrbo.com", "expedia.com", "hotels.com", "agoda.com", "tripadvisor.com",
  "viator.com", "getyourguide.com", "opentable.com", "resy.com", "fresha.com", "vagaro.com", "booksy.com",
  "yelp.com", "trip.com", "kayak.com", "hostelworld.com", "rentalcars.com", "turo.com",
  // Site builders and link pages
  "wixsite.com", "wix.com", "squarespace.com", "weebly.com", "godaddysites.com", "business.site",
  "wordpress.com", "blogspot.com", "myshopify.com", "square.site", "carrd.co", "linktr.ee", "webnode.page",
  "site123.me", "jimdosite.com", "webflow.io", "github.io", "netlify.app", "vercel.app",
  // Social and messaging
  "facebook.com", "fb.com", "instagram.com", "google.com", "youtube.com", "tiktok.com", "x.com",
  "twitter.com", "linkedin.com", "whatsapp.com", "wa.me",
  // Hotel and resort brands with separately owned or managed properties
  "marriott.com", "hilton.com", "hyatt.com", "ihg.com", "wyndhamhotels.com", "accor.com", "choicehotels.com",
  "bestwestern.com", "radissonhotels.com", "fourseasons.com", "ritzcarlton.com", "sandals.com", "beaches.com",
  "riu.com", "clubmed.com", "rosewoodhotels.com", "iberostar.com", "barcelo.com", "melia.com", "hardrockhotels.com",
  "atlantisbahamas.com", "royalton.com", "karismahotels.com", "palaceresorts.com", "amresorts.com",
  // Car rental and tour brands
  "hertz.com", "avis.com", "budget.com", "enterprise.com", "sixt.com", "europcar.com", "islandroutes.com",
];

/** True when `domain` is, or is a subdomain of, a host shared by unrelated businesses. */
export function isSharedHostDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const value = domain.trim().toLowerCase().replace(/\.$/, "");
  return SHARED_HOST_DOMAINS.some((host) => value === host || value.endsWith(`.${host}`));
}

/** How many OTHER listings use the same contact point as the listing being claimed. */
export interface ContactExclusivity {
  /** Other listings whose trusted phone is this listing's trusted phone. */
  phoneSharedBy: number;
  /** Other listings that publish this listing's exact email address. */
  emailSharedBy: number;
  /** Other listings whose email domain or website host is the claimant's email domain. */
  domainSharedBy: number;
  /** Listings this account already claimed by domain match. */
  priorDomainClaims: number;
}

export type InstantClaimBlock = "no_match" | "shared_email" | "shared_host" | "shared_domain" | "already_used";

export interface InstantClaimDecision { eligible: boolean; reason: InstantClaimBlock | null }

/**
 * One-click claim for an account whose verified email matches the business.
 *
 * - The exact published address proves this listing only if no other listing publishes it.
 * - A mailbox on the business's domain proves this listing only if the domain is not a shared
 *   host, no other listing uses the domain, and the account has not already claimed another
 *   listing this way.
 */
export function instantClaimDecision(input: {
  exactEmailMatch: boolean;
  domainMatch: boolean;
  claimantDomain: string | null;
  exclusivity: ContactExclusivity;
}): InstantClaimDecision {
  const { exactEmailMatch, domainMatch, claimantDomain, exclusivity } = input;
  if (exactEmailMatch) {
    return exclusivity.emailSharedBy > 0 ? { eligible: false, reason: "shared_email" } : { eligible: true, reason: null };
  }
  if (!domainMatch || !claimantDomain) return { eligible: false, reason: "no_match" };
  if (isSharedHostDomain(claimantDomain)) return { eligible: false, reason: "shared_host" };
  if (exclusivity.domainSharedBy > 0) return { eligible: false, reason: "shared_domain" };
  if (exclusivity.priorDomainClaims > 0) return { eligible: false, reason: "already_used" };
  return { eligible: true, reason: null };
}

export type ClaimChannel = "sms" | "call" | "email";

/** The code-delivery channels that can prove ownership of this listing. */
export function automaticClaimChannels(input: {
  phoneAvailable: boolean;
  emailAvailable: boolean;
  exclusivity: Pick<ContactExclusivity, "phoneSharedBy" | "emailSharedBy">;
}): { channels: ClaimChannel[]; sharedContact: boolean } {
  const channels: ClaimChannel[] = [];
  const phoneOk = input.phoneAvailable && input.exclusivity.phoneSharedBy === 0;
  const emailOk = input.emailAvailable && input.exclusivity.emailSharedBy === 0;
  if (phoneOk) channels.push("sms", "call");
  if (emailOk) channels.push("email");
  const sharedContact =
    (input.phoneAvailable && input.exclusivity.phoneSharedBy > 0) || (input.emailAvailable && input.exclusivity.emailSharedBy > 0);
  return { channels, sharedContact };
}

export const SHARED_CONTACT_MESSAGE =
  "This business shares that contact with other listings, so a code sent there cannot show who runs this one. Request a team review and we will verify the claim with you.";

export const INSTANT_CLAIM_MESSAGES: Record<InstantClaimBlock, string> = {
  no_match: "Your account email does not match this business. Verify with a code, or request a team review.",
  shared_email: "Other listings publish the same email address, so it cannot show who runs this one. Request a team review and we will verify the claim with you.",
  shared_host: "That email domain is used by many unrelated businesses, so it cannot show who runs this listing. Verify with a code, or request a team review.",
  shared_domain: "Other listings use the same email or website domain, so it cannot show who runs this one. Verify with a code sent to this business, or request a team review.",
  already_used: "This account has already claimed a listing by email domain. Verify this one with a code sent to the business, or request a team review.",
};
