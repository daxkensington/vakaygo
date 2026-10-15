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
    const cleaned = decodeURIComponent(raw)
      .replace(/^mailto:/i, "")
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

  // 1. High-signal mailto: links
  const mailtoRegex = /mailto:([^\s"'<>?#]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoRegex.exec(html)) !== null) {
    recordCandidate(match[1], 40);
  }

  // 2. Plain email addresses in text/attributes
  const emailRegex = /\b([a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,190}\.[a-zA-Z]{2,24})\b/g;
  while ((match = emailRegex.exec(html)) !== null) {
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
    return text.slice(0, 250_000);
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
  if (!options?.force && row.interestedCustomers < 1) {
    return { sent: false, reason: "no_active_interest" };
  }
  if (
    !options?.force &&
    row.contactedAt &&
    Date.now() - new Date(row.contactedAt).getTime() < 7 * 24 * 60 * 60 * 1000
  ) {
    return { sent: false, reason: "cooldown_active" };
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

  const count = Math.max(1, Number(row.interestedCustomers) || 1);
  const countLabel = count === 1 ? "1 verified traveler has" : `${count} verified travelers have`;
  const eTitle = escapeHtml(row.title);
  const eIsland = escapeHtml(row.islandName);

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1C2333">
<div style="max-width:580px;margin:0 auto;padding:36px 20px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:26px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
    <p style="margin:4px 0 0;font-size:12px;color:#6E7491;letter-spacing:0.08em;text-transform:uppercase">Caribbean Travel Directory &amp; Marketplace</p>
  </div>
  <div style="background:#1C2333;border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:24px">
    <p style="color:#E8B84B;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 8px">Traveler Interest Alert · ${eIsland}</p>
    <h1 style="color:#FFFFFF;font-size:22px;line-height:1.35;margin:0">${eTitle}</h1>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:28px 24px;border:1px solid #EDE5D5;box-shadow:0 2px 12px rgba(28,35,51,0.06)">
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2D334A">Hello <strong>${eTitle}</strong> team,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2D334A">
      <strong>${countLabel}</strong> recorded interest in your business listing in <strong>${eIsland}</strong> on VakayGo.
      <span style="color:#6E7491;font-size:13px">(These are traveler interest signals on our directory, not reservations or payment obligations.)</span>
    </p>
    <div style="background:#FAF5E8;border-left:4px solid #C8912E;border-radius:10px;padding:16px;margin:20px 0">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1C2333">Why claim your free listing on VakayGo?</p>
      <ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.65;color:#4A4F73">
        <li><strong>100% Free to Claim:</strong> Verify ownership in 2 minutes and control your description, photos, hours, and contact info.</li>
        <li><strong>Direct Traveler Connection:</strong> Respond to traveler inquiries and showcase your experiences across 21 Caribbean islands.</li>
        <li><strong>Flexible Caribbean Payouts:</strong> When you choose to enable online bookings, receive payouts via <strong>Wise, PayPal, Local/International Bank Wire, or Stripe</strong>.</li>
      </ul>
    </div>
    <div style="text-align:center;margin:26px 0 18px">
      <a href="${claimUrl}" style="display:inline-block;background:#C8912E;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px">
        ${row.claimVerified ? "Open Your Business Dashboard" : "Claim Your Listing for Free →"}
      </a>
    </div>
    <p style="margin:0;text-align:center;font-size:13px;color:#6E7491">
      View your public directory page: <a href="${listingUrl}" style="color:#C8912E;text-decoration:underline">${listingUrl}</a>
    </p>
  </div>
  <div style="text-align:center;margin-top:24px;font-size:12px;color:#8C90A4;line-height:1.6">
    <p style="margin:0">Questions? Reply directly to this email or contact <a href="mailto:support@vakaygo.com" style="color:#C8912E">support@vakaygo.com</a>.</p>
    <p style="margin:6px 0 0">
      VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#8C90A4">vakaygo.com</a><br>
      If you do not want further business interest notifications from VakayGo, <a href="${unsubUrl}" style="color:#8C90A4;text-decoration:underline">click here to opt out</a> or reply "unsubscribe".
    </p>
  </div>
</div>
</body></html>`.trim();

  await sendEmail({
    from: FROM,
    to: targetEmail,
    replyTo: REPLY_TO,
    subject: `Traveler interest in ${row.title} on VakayGo (${row.islandName})`,
    html,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const triggerLabel = options?.triggeredBy || "auto";
  const noteAddition = `[${stamp}] Claim invitation emailed to ${targetEmail} (${triggerLabel}, ${count} interested).`;
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
