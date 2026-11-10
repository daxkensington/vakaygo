/**
 * Syntactic screen for a scraped business address. It cannot prove a mailbox exists;
 * it only rejects addresses that are certain or near-certain to bounce or to reach
 * the wrong party, so they are never stored, granted permission or sent to.
 */

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

/**
 * Endings that are not delegated top-level domains but do turn up in scraped pages:
 * reserved names, private-network suffixes, page extensions, and ROT13-obfuscated
 * endings decoded as-is (.pbz = .com, .arg = .net, .rqh = .edu, .tbi = .gov,
 * .ovm = .biz, .vasb = .info).
 */
const UNDELIVERABLE_TLDS = new Set([
  "invalid", "local", "localdomain", "localhost", "test", "internal", "lan", "home", "corp", "mail",
  "html", "htm", "php", "asp", "aspx", "jsp", "json", "xml",
  "pbz", "arg", "rqh", "tbi", "ovm", "vasb",
]);

/** Real top-level domains that begin with com/net/org/edu/gov, so the glued-text rule spares them. */
const REAL_LONG_TLDS = new Set(["comcast", "community", "company", "compare", "computer", "comsec", "commbank", "network", "netbank", "netflix", "organic"]);

export function isValidBusinessEmail(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(email)) return false;

  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  // Leftovers of URL or HTML escaping, and dot placement no mail server accepts.
  if (local.length > 64 || local.includes("%") || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (/^u00[0-9a-f]{2}/.test(local)) return false; // ">" style escape glued to the address
  const labels = domain.split(".");
  if (labels.some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return false;
  const tld = labels[labels.length - 1];
  if (UNDELIVERABLE_TLDS.has(tld)) return false;
  // Text glued onto a real ending by a bad extraction, e.g. "info@hotel.comthe".
  if (/^(?:com|net|org|edu|gov)[a-z]+$/.test(tld) && !REAL_LONG_TLDS.has(tld)) return false;
  if (/^(?:badmail|honeypot|spamtrap)\./i.test(domain)) return false;
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
