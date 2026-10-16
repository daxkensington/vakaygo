import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { sendEmail } from "@/server/mail-client";
import { safeWebUrl } from "@/lib/listing-structured-data";
import { isListingId } from "@/lib/listing-interest";
import { logger } from "@/lib/logger";

const FROM = "VakayGo <hello@vakaygo.com>";
const REPLY_TO = "support@vakaygo.com";

const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "domain.com",
  "yoursite.com",
  "company.com",
  "email.com",
  "sentry.io",
  "sentry.wixpress.com",
  "wixpress.com",
  "wix.com",
  "squarespace.com",
  "godaddy.com",
  "wordpress.org",
  "wordpress.com",
  "schema.org",
  "w3.org",
  "googleapis.com",
  "googleusercontent.com",
  "gstatic.com",
  "cloudflare.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "tripadvisor.com",
  "booking.com",
  "airbnb.com",
  "expedia.com",
  "viator.com",
  "vakaygo.com",
]);

const BLOCKED_LOCAL_PREFIXES = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "privacy",
  "legal",
  "dmca",
  "security",
  "mailer-daemon",
];

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

export function isValidBusinessEmail(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(email)) return false;

  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (domain.endsWith(".invalid") || domain.endsWith(".local") || domain.endsWith(".test")) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|avif|css|js|woff|woff2|ttf|eot|mp4|pdf|zip)$/i.test(domain)) return false;
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return false;
  for (const blocked of BLOCKED_EMAIL_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return false;
  }
  if (BLOCKED_LOCAL_PREFIXES.some((prefix) => local === prefix || local.startsWith(`${prefix}+`) || local.startsWith(`${prefix}.`))) {
    return false;
  }
  // Reject UUID-like or hex-hash local parts (e.g. Sentry ingest addresses)
  if (/^[0-9a-f]{20,}$/.test(local)) return false;
  return true;
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

export async function sendBusinessInterestOutreachEmail(
  listingId: string,
  options?: {
    force?: boolean;
    triggeredBy?: "traveler_interest" | "admin" | "cron";
    recipientOverride?: string;
    markStatusContacted?: boolean;
  }
): Promise<{
  sent: boolean;
  email?: string;
  reason?: string;
}> {
  if (!isListingId(listingId) || !process.env.DATABASE_URL) {
    return { sent: false, reason: "invalid_listing" };
  }

  const db = neon(process.env.DATABASE_URL);
  const [row] = await db.query(
    `SELECT l.id, l.title, l.slug, l.status AS "listingStatus",
            l.type_data->>'email' AS email,
            l.type_data->>'website' AS website,
            i.slug AS "islandSlug", i.name AS "islandName", i.is_active AS "islandActive",
            o.status AS "outreachStatus", o.notes AS "outreachNotes", o.contacted_at AS "contactedAt",
            (coalesce(d.interested_customers, 0) + coalesce(bk.booking_count, 0))::int AS "interestedCustomers",
            vakaygo_listing_claim_verified(l.id) AS "claimVerified"
     FROM listings l
     JOIN islands i ON i.id = l.island_id
     LEFT JOIN business_outreach o ON o.listing_id = l.id
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS interested_customers
       FROM listing_interest li
       JOIN users u ON u.id = li.user_id
       WHERE li.listing_id = l.id
         AND li.active = true
         AND u.email_verified = true
         AND u.role <> 'admin'
         AND u.id <> l.operator_id
     ) d ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS booking_count
       FROM bookings b
       WHERE b.listing_id = l.id
     ) bk ON true
     WHERE l.id = $1
     LIMIT 1`,
    [listingId]
  );

  if (!row || row.listingStatus !== "active" || !row.islandActive) {
    return { sent: false, reason: "listing_inactive" };
  }
  if (row.outreachStatus === "do_not_contact") {
    return { sent: false, reason: "suppressed" };
  }
  if (!options?.force && options?.triggeredBy !== "cron" && row.interestedCustomers < 1) {
    return { sent: false, reason: "no_active_interest" };
  }
  // Never auto-email an unclaimed business more than once unless explicitly forced by an admin
  if (!options?.force && row.contactedAt) {
    return { sent: false, reason: "already_contacted" };
  }

  // Enforce strict global hourly (max 4/hr) and daily (max 18/24h) outreach caps to protect domain reputation
  if (!options?.force) {
    const [rateRow] = await db.query(
      `SELECT
         count(*) FILTER (WHERE contacted_at > now() - interval '1 hour')::int AS last_hour,
         count(*) FILTER (WHERE contacted_at > now() - interval '24 hours')::int AS last_day
       FROM business_outreach
       WHERE contacted_at IS NOT NULL`
    );
    if ((rateRow?.last_hour ?? 0) >= 4) {
      return { sent: false, reason: "hourly_outreach_cap_reached" };
    }
    if ((rateRow?.last_day ?? 0) >= 18) {
      return { sent: false, reason: "daily_outreach_cap_reached" };
    }
  }

  let targetEmail: string | null = null;
  if (options?.recipientOverride && isValidBusinessEmail(options.recipientOverride)) {
    targetEmail = options.recipientOverride.trim().toLowerCase();
    await db.query(
      `UPDATE listings
       SET type_data = jsonb_set(coalesce(type_data::jsonb, '{}'::jsonb), '{email}', to_jsonb($2::text), true)::json,
           updated_at = now()
       WHERE id = $1`,
      [listingId, targetEmail]
    );
  } else if (isValidBusinessEmail(row.email)) {
    targetEmail = row.email.trim().toLowerCase();
  } else {
    const enriched = await enrichListingContactEmail(listingId);
    targetEmail = enriched.email;
  }

  if (!targetEmail) {
    return { sent: false, reason: "no_email_on_file" };
  }

  if (!process.env.RESEND_API_KEY) {
    return { sent: false, email: targetEmail, reason: "mail_unconfigured" };
  }

  const listingUrl = `https://vakaygo.com/${row.islandSlug}/${row.slug}`;
  const claimUrl = row.claimVerified
    ? "https://vakaygo.com/operator"
    : `https://vakaygo.com/auth/signup?role=operator&claim=${row.id}`;
  const unsubToken = createOutreachUnsubscribeToken(row.id);
  const unsubUrl = `https://vakaygo.com/api/outreach/unsubscribe?listingId=${encodeURIComponent(row.id)}&token=${unsubToken}`;

  const rawCount = Math.max(0, Number(row.interestedCustomers) || 0);
  const hasInterest = rawCount >= 1;
  const countLabel = rawCount === 1 ? "1 verified traveler has" : `${rawCount} verified travelers have`;
  const eTitle = escapeHtml(row.title);
  const eIsland = escapeHtml(row.islandName);

  const subject = hasInterest
    ? `Traveler inquiry for ${row.title} (${row.islandName})`
    : `Verify your ${row.title} listing on VakayGo (${row.islandName})`;

  const introText = hasInterest
    ? `${countLabel} expressed interest in your listing in ${row.islandName} on VakayGo (${listingUrl}).`
    : `Your business is featured in our ${row.islandName} travel guide on VakayGo (${listingUrl}), where travelers discover and book verified local experiences, stays, dining, and charters.`;

  const introHtml = hasInterest
    ? `<p>${countLabel} expressed interest in your business listing in <strong>${eIsland}</strong> on VakayGo (<a href="${listingUrl}" style="color:#0D9488">${listingUrl}</a>).</p>`
    : `<p>Your business is featured in our <strong>${eIsland}</strong> travel guide on VakayGo (<a href="${listingUrl}" style="color:#0D9488">${listingUrl}</a>), where travelers discover and book verified local experiences, stays, dining, and charters.</p>`;

  const text = [
    `Hello ${row.title} team,`,
    ``,
    introText,
    ``,
    `Claiming your listing is 100% free and lets you:`,
    `- Update your photos, pricing, WhatsApp/phone contact, and availability`,
    `- Respond directly to traveler inquiries and booking requests`,
    `- Keep 85%-90% on direct bookings with a 0% guest booking fee (saving up to 50% compared to legacy 20%-30% OTA commissions)`,
    `- Receive payouts via Wise, PayPal, or local/international bank wire`,
    ``,
    `Verify ownership of your page in 60 seconds here:`,
    `${claimUrl}`,
    ``,
    `If you have any questions or would like us to update your business information for you, simply reply to this email.`,
    ``,
    `Best regards,`,
    `VakayGo Partner Support`,
    `support@vakaygo.com`,
    ``,
    `---`,
    `To opt out of future listing notifications for ${row.title}, visit: ${unsubUrl}`,
  ].join("\n");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1C2333;font-size:15px;line-height:1.6">
  <p>Hello <strong>${eTitle}</strong> team,</p>
  ${introHtml}
  <p>Claiming your VakayGo listing is <strong>100% free</strong> and gives you full control:</p>
  <ul style="padding-left:20px;margin:12px 0">
    <li><strong>0% Guest Booking Fee:</strong> Travelers pay zero platform markup.</li>
    <li><strong>Keep 85%&ndash;90% of Every Booking:</strong> Save up to 50% vs. traditional 20%&ndash;30% OTA commissions.</li>
    <li><strong>Fast Regional Payouts:</strong> Get paid via Wise, PayPal, or local/international bank wire.</li>
    <li><strong>Direct Inquiries:</strong> Update your photos, rates, and respond directly to travelers.</li>
  </ul>
  <p>Verify ownership of your listing in 60 seconds here:</p>
  <p><a href="${claimUrl}" style="color:#0D9488;font-weight:600">${claimUrl}</a></p>
  <p>If you have any questions or would like our team to update any information on your page, just reply to this email.</p>
  <p>Best regards,<br>VakayGo Partner Support</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
  <p style="font-size:12px;color:#6B7280">If you prefer not to receive partner or inquiry notifications for ${eTitle}, <a href="${unsubUrl}" style="color:#6B7280">unsubscribe here</a> or reply &ldquo;unsubscribe&rdquo;.</p>
</div>`;

  await sendEmail({
    from: FROM,
    to: targetEmail,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>, <mailto:support@vakaygo.com?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const triggerLabel = options?.triggeredBy || "auto";
  const noteAddition = `[${stamp}] Claim invitation emailed to ${targetEmail} (${triggerLabel}, ${rawCount} interested).`;
  const nextStatus = options?.markStatusContacted ? "contacted" : row.outreachStatus || "new";

  await db.query(
    `INSERT INTO business_outreach (listing_id, status, notes, contacted_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (listing_id) DO UPDATE
     SET status = CASE
           WHEN business_outreach.status = 'do_not_contact' THEN 'do_not_contact'
           WHEN $4::boolean = true THEN 'contacted'
           ELSE business_outreach.status
         END,
         contacted_at = now(),
         updated_at = now(),
         notes = left(
           CASE
             WHEN business_outreach.notes = '' THEN $3
             ELSE business_outreach.notes || E'\\n' || $3
           END,
           4000
         )`,
    [listingId, nextStatus, noteAddition, Boolean(options?.markStatusContacted)]
  );

  return { sent: true, email: targetEmail };
}
