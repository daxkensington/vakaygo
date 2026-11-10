import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { deliverClaimInvitation } from "@/server/outreach-campaign-send";
import { claimInvitationUrl, unsubscribeInvitationUrl } from "@/server/outreach-attribution";
import { safeWebUrl } from "@/lib/listing-structured-data";
import { isListingId } from "@/lib/listing-interest";
import { OPERATING_BUSINESS } from "@/lib/brand";
import { isValidBusinessEmail } from "@/lib/outreach-email-validation";
import { evaluateOutreachCountryGate, requiresSolicitationNotice, type OutreachPermissionRecord } from "@/lib/outreach-country-policy";

export { isValidBusinessEmail };


const PREFERRED_LOCAL_PREFIXES = [
  "bookings",
  "booking",
  "reservations",
  "reserve",
  "info",
  "hello",
  "contact",
  "charters",
  "tours",
  "concierge",
  "frontdesk",
  "stay",
  "welcome",
  "admin",
  "office",
  "sales",
  "inquiries",
  "enquiries",
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getHmacSecret(): string {
  return process.env.AUTH_SECRET || process.env.CRON_SECRET || "vakaygo-outreach-default-secret";
}

export function createOutreachUnsubscribeToken(listingId: string): string {
  return crypto
    .createHmac("sha256", getHmacSecret())
    .update(`outreach-unsub:${listingId}`)
    .digest("hex");
}

export function verifyOutreachUnsubscribeToken(listingId: string, token: string): boolean {
  if (!isListingId(listingId) || typeof token !== "string" || !/^[0-9a-f]{64}$/i.test(token)) {
    return false;
  }
  const expected = createOutreachUnsubscribeToken(listingId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token.toLowerCase(), "hex"));
  } catch {
    return false;
  }
}

function decodeCfEmail(hex: string): string {
  try {
    const r = parseInt(hex.slice(0, 2), 16);
    let email = "";
    for (let n = 2; n < hex.length; n += 2) {
      const charCode = parseInt(hex.slice(n, n + 2), 16) ^ r;
      email += String.fromCharCode(charCode);
    }
    return email;
  } catch {
    return "";
  }
}

export function extractBusinessEmailsFromHtml(html: string, websiteUrl?: string | null): string[] {
  if (!html || typeof html !== "string") return [];

  let siteDomain = "";
  if (websiteUrl) {
    try {
      siteDomain = new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      siteDomain = "";
    }
  }

  const candidates = new Map<string, number>();

  const recordCandidate = (raw: string, bonus: number) => {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // ignore malformed URI sequence
    }
    const cleaned = decoded
      .replace(/^mailto:/i, "")
      .replace(/\\u0040/gi, "@")
      .replace(/&#64;/g, "@")
      .replace(/&#46;/g, ".")
      .split(/[?&"'\s<>(),;]/)[0]
      .replace(/[.:,;]+$/, "")
      .trim()
      .toLowerCase();

    if (!isValidBusinessEmail(cleaned)) return;

    const [local, domain] = cleaned.split("@");
    let score = bonus;

    if (siteDomain && (domain === siteDomain || domain.endsWith(`.${siteDomain}`) || siteDomain.endsWith(`.${domain}`))) {
      score += 50;
    }

    const prefixRank = PREFERRED_LOCAL_PREFIXES.findIndex((p) => local === p || local.startsWith(p));
    if (prefixRank !== -1) {
      score += 30 - prefixRank;
    }

    const prev = candidates.get(cleaned) ?? -999;
    if (score > prev) {
      candidates.set(cleaned, score);
    }
  };

  // 1. Cloudflare email-protection (data-cfemail and /cdn-cgi/l/email-protection#...)
  const cfRegex = /(?:data-cfemail=["']|\/cdn-cgi\/l\/email-protection#)([0-9a-fA-F]{10,200})/g;
  let match: RegExpExecArray | null;
  while ((match = cfRegex.exec(html)) !== null) {
    const cfDecoded = decodeCfEmail(match[1]);
    if (cfDecoded) recordCandidate(cfDecoded, 45);
  }

  // 2. High-signal mailto: links
  const mailtoRegex = /mailto:([^\s"'<>?#]+)/gi;
  while ((match = mailtoRegex.exec(html)) !== null) {
    recordCandidate(match[1], 40);
  }

  // 3. Obfuscated [at] / (at) addresses
  const obfRegex = /\b([a-zA-Z0-9._%+-]{1,64})\s*(?:\[at\]|\(at\))\s*([a-zA-Z0-9.-]{1,190})\s*(?:\[dot\]|\(dot\)|\.)\s*([a-zA-Z]{2,24})\b/gi;
  while ((match = obfRegex.exec(html)) !== null) {
    recordCandidate(`${match[1]}@${match[2]}.${match[3]}`, 30);
  }

  // 4. Plain email addresses in text/attributes
  const normalizedHtml = html.replace(/&#64;/g, "@").replace(/&#46;/g, ".").replace(/\\u0040/gi, "@");
  const emailRegex = /\b([a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,190}\.[a-zA-Z]{2,24})\b/g;
  while ((match = emailRegex.exec(normalizedHtml)) !== null) {
    recordCandidate(match[1], 10);
  }

  return Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([email]) => email);
}

function isSafePublicWebsite(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".invalid") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host) ||
      host.startsWith("[")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function fetchHtmlWithTimeout(url: string, timeoutMs = 4500): Promise<string | null> {
  if (!isSafePublicWebsite(url)) return null;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VakayGoDirectory/1.0; +https://vakaygo.com/for-businesses)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return null;
    }
    const text = await res.text();
    return text.slice(0, 2_000_000);
  } catch {
    return null;
  }
}

export async function enrichListingContactEmail(listingId: string): Promise<{
  email: string | null;
  enriched: boolean;
  source: "existing" | "website" | "none";
}> {
  if (!isListingId(listingId) || !process.env.DATABASE_URL) {
    return { email: null, enriched: false, source: "none" };
  }

  const db = neon(process.env.DATABASE_URL);
  const [row] = await db.query(
    `SELECT id, type_data->>'email' AS email, type_data->>'website' AS website
     FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );

  if (!row) return { email: null, enriched: false, source: "none" };
  if (isValidBusinessEmail(row.email)) {
    return { email: row.email.trim().toLowerCase(), enriched: false, source: "existing" };
  }

  const website = safeWebUrl(row.website);
  if (!website || !isSafePublicWebsite(website)) {
    return { email: null, enriched: false, source: "none" };
  }

  const homeHtml = await fetchHtmlWithTimeout(website, 4500);
  let emails = homeHtml ? extractBusinessEmailsFromHtml(homeHtml, website) : [];

  if (emails.length === 0) {
    try {
      const origin = new URL(website).origin;
      for (const path of ["/contact", "/contact-us", "/about"]) {
        const subHtml = await fetchHtmlWithTimeout(`${origin}${path}`, 3500);
        if (subHtml) {
          emails = extractBusinessEmailsFromHtml(subHtml, website);
          if (emails.length > 0) break;
        }
      }
    } catch {
      // ignore invalid URLs
    }
  }

  const bestEmail = emails[0] || null;
  if (!bestEmail) {
    return { email: null, enriched: false, source: "none" };
  }

  await db.query(
    `UPDATE listings
     SET type_data = jsonb_set(
       jsonb_set(coalesce(type_data::jsonb, '{}'::jsonb), '{email}', to_jsonb($2::text), true),
       '{emailSource}', '"website_auto"'::jsonb, true
     )::json,
     updated_at = now()
     WHERE id = $1`,
    [listingId, bestEmail]
  );

  return { email: bestEmail, enriched: true, source: "website" };
}

/** All callers, including admins and traveler-interest handlers, share the same delivery gates. */
export async function sendBusinessInterestOutreachEmail(
  listingId: string,
  // Kept for existing callers only. No legacy option can bypass campaign policy,
  // replace a recipient, trigger scraping or force a second invitation.
  _options?: {
    force?: boolean;
    bypassQuietHours?: boolean;
    triggeredBy?: "traveler_interest" | "admin" | "cron";
    recipientOverride?: string;
    markStatusContacted?: boolean;
  }
): Promise<{ sent: boolean; email?: string; reason?: string; attemptId?: string }> {
  if (!isListingId(listingId) || !process.env.DATABASE_URL) {
    return { sent: false, reason: "invalid_listing" };
  }

  const db = neon(process.env.DATABASE_URL);
  // One read. The address-level history check keeps a business that was already
  // emailed (or opted out) for one listing from being invited again for another.
  const [row] = await db.query(
    `SELECT l.id, l.title, l.slug AS "listingSlug", l.status AS "listingStatus", l.type_data->>'email' AS email,
            i.slug AS "islandSlug", i.name AS "islandName", i.country AS "islandCountry",
            i.is_active AS "islandActive", o.status AS "outreachStatus", o.contacted_at AS "contactedAt",
            vakaygo_listing_claim_verified(l.id) AS "claimVerified",
            (SELECT coalesce(json_agg(json_build_object('kind',p.permission_kind,'country',p.recipient_country)),'[]'::json)
               FROM outreach_recipient_consents p JOIN outreach_campaign_control cc ON cc.id=true AND cc.provider=p.provider
              WHERE p.listing_id=l.id AND p.recipient_email=lower(btrim(l.type_data->>'email'))
                AND p.revoked_at IS NULL AND p.granted_at<=now()) AS permissions,
            EXISTS(SELECT 1 FROM business_outreach lo JOIN listings ll ON ll.id=lo.listing_id
              WHERE lo.listing_id<>l.id AND (lo.status='do_not_contact' OR lo.contacted_at IS NOT NULL)
                AND (lower(btrim(ll.type_data->>'email'))=lower(btrim(l.type_data->>'email'))
                  OR lower(btrim(l.type_data->>'email')) IN (SELECT lower(m[1])
                    FROM regexp_matches(lo.notes,'Claim invitation emailed to ([^[:space:]]+)','g') m))) AS "addressAlreadyContacted"
       FROM listings l
       JOIN islands i ON i.id=l.island_id
       LEFT JOIN business_outreach o ON o.listing_id=l.id
      WHERE l.id=$1 LIMIT 1`,
    [listingId]
  );
  if (!row || row.listingStatus !== "active" || row.islandActive !== true) {
    return { sent: false, reason: "listing_inactive" };
  }
  if (row.claimVerified !== false) return { sent: false, reason: "listing_already_claimed" };
  if (row.outreachStatus === "do_not_contact") return { sent: false, reason: "suppressed" };
  if (row.contactedAt) return { sent: false, reason: "already_contacted" };
  if (!isValidBusinessEmail(row.email)) return { sent: false, reason: "no_email_on_file" };
  if (row.addressAlreadyContacted === true) return { sent: false, reason: "address_already_contacted" };

  // Country policy applies to every caller before an attempt is reserved, so a
  // refused destination never consumes the one-invitation-per-address slot.
  const islandSlug = String(row.islandSlug || "");
  const countryGate = evaluateOutreachCountryGate({
    islandSlug,
    permissions: Array.isArray(row.permissions) ? row.permissions as OutreachPermissionRecord[] : [],
  });
  if (!countryGate.allowed) return { sent: false, reason: countryGate.reason };

  // Existing contact data is evidence, not permission. The delivery helper
  // rechecks recipient consent, suppression, caps, local hours and transport
  // configuration, and atomically reserves the single durable attempt.
  const recipient = row.email.trim().toLowerCase();
  if (_options?.recipientOverride && _options.recipientOverride.trim().toLowerCase() !== recipient) {
    return { sent: false, reason: "recipient_override_not_supported" };
  }
  return deliverClaimInvitation({
    listingId,
    recipient,
    islandSlug,
    islandCountry: String(row.islandCountry || ""),
    buildMessage: (attemptId: string) => {
      const claimUrl = claimInvitationUrl(attemptId, listingId);
      const unsubscribeUrl = unsubscribeInvitationUrl(attemptId);
      const postalAddress = process.env.OUTREACH_SENDER_POSTAL_ADDRESS?.trim();
      if (!postalAddress || postalAddress.length < 8) throw new Error("Sender postal address is required");
      const title = String(row.title || "").replace(/[\r\n]+/g, " ").trim().slice(0, 160);
      const island = String(row.islandName || "").replace(/[\r\n]+/g, " ").trim().slice(0, 100);
      if (!title || !island) throw new Error("Listing name and destination are required");
      const listingSlug = String(row.listingSlug || "");
      const listingUrl = /^[a-z0-9-]{1,200}$/.test(islandSlug) && /^[a-z0-9-]{1,200}$/.test(listingSlug)
        ? `https://vakaygo.com/${islandSlug}/${listingSlug}` : null;
      // US law (CAN-SPAM) requires a commercial message to say that it is one.
      const solicitation = requiresSolicitationNotice(islandSlug)
        ? `This message is a business solicitation from VakayGo, operated by ${OPERATING_BUSINESS}.` : null;
      const text = [
        `Hello ${title} team,`,
        "",
        `VakayGo is a travel marketplace where visitors look for places to stay, tours, dining and transport in ${island}. ${title} already has a public listing there, and we are inviting your team to review it.`,
        ...(listingUrl ? ["You can see the listing here:", listingUrl, ""] : [""]),
        "If you represent this business, you can start a free listing claim and complete ownership verification here:",
        claimUrl,
        "",
        "A listing claim is free. After ownership verification, you can review the business profile and how traveler inquiries are handled.",
        "An inquiry is not a reservation. Accepting bookings requires separate supplier onboarding and activation; bookings and checkout must take place through VakayGo.",
        "We are not confirming that booking or payment is enabled for your listing.",
        "",
        "If the listing details are incorrect or you need help with the claim, reply to this email.",
        "",
        "The VakayGo Team",
        "support@vakaygo.com",
        "",
        ...(solicitation ? [solicitation, ""] : []),
        OPERATING_BUSINESS + " · VakayGo",
        postalAddress,
        "",
        `To stop these listing invitations, unsubscribe here: ${unsubscribeUrl}`,
      ].join("\n");
      const eTitle = escapeHtml(title);
      const eIsland = escapeHtml(island);
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.6">
  <p>Hello <strong>${eTitle}</strong> team,</p>
  <p>VakayGo is a travel marketplace where visitors look for places to stay, tours, dining and transport in ${eIsland}. ${eTitle} already has a public listing there, and we are inviting your team to review it.</p>${listingUrl ? `
  <p><a href="${escapeHtml(listingUrl)}">See the ${eTitle} listing</a></p>` : ""}
  <p>If you represent this business, you can <a href="${escapeHtml(claimUrl)}">start a free listing claim</a> and complete ownership verification.</p>
  <p>A listing claim is free. After ownership verification, you can review the business profile and how traveler inquiries are handled.</p>
  <p>An inquiry is not a reservation. Accepting bookings requires separate supplier onboarding and activation; bookings and checkout must take place through VakayGo. We are not confirming that booking or payment is enabled for your listing.</p>
  <p>If the listing details are incorrect or you need help with the claim, reply to this email.</p>
  <p>The VakayGo Team<br>support@vakaygo.com</p>
  <hr>${solicitation ? `
  <p>${escapeHtml(solicitation)}</p>` : ""}
  <p>${escapeHtml(OPERATING_BUSINESS)} · VakayGo<br>${escapeHtml(postalAddress).replace(/\r?\n/g, "<br>")}</p>
  <p><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from these listing invitations</a></p>
</div>`;
      // The subject names the public listing without implying an existing account.
      return { subject: `${title} is listed on VakayGo (${island}): free to claim`, text, html };
    },
  });
}
