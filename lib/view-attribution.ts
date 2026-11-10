/**
 * Listing-view attribution, shared by the browser beacon and the view route.
 *
 * A view is counted for everyone, with or without cookie consent: the count
 * is a first-party tally, and none of what is recorded here (browser family,
 * referring site, campaign tag, country, a bot flag) identifies a person.
 *
 * Pure: no DB, no DOM globals, importable from client and server code.
 */

/** Values the `listing_views.source` column may hold. */
export const VIEW_SOURCES = [
  // no referrer
  "direct", "campaign",
  // arrived from another VakayGo page
  "explore", "search", "island", "internal",
  // search engines
  "google", "bing", "duckduckgo", "yahoo", "yandex", "baidu", "ecosia", "brave",
  // AI assistants
  "chatgpt", "perplexity", "claude", "gemini", "copilot",
  // social
  "facebook", "instagram", "x", "tiktok", "pinterest", "reddit", "youtube", "linkedin", "whatsapp",
  // other
  "email", "landfall", "referral",
] as const;
export type ViewSource = (typeof VIEW_SOURCES)[number];

const SOURCE_SET = new Set<string>(VIEW_SOURCES);
export function cleanViewSource(value: unknown): ViewSource {
  return typeof value === "string" && SOURCE_SET.has(value) ? (value as ViewSource) : "direct";
}

const HOST_RE = /^(?=.{1,128}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** A bare lower-case hostname, or null. Paths, ports, credentials and IPs are dropped. */
export function cleanReferrerHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (!HOST_RE.test(host) || /^[0-9.]+$/.test(host)) return null;
  return host;
}

/** A campaign tag such as `chatgpt.com` or `newsletter-nov`, or null. */
export function cleanUtmSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(tag) ? tag : null;
}

const HOST_CLASSES: [RegExp, ViewSource][] = [
  // Mail first: mail.google.com and mail.yahoo.com are not search traffic.
  [/^(mail\.google\.com|mail\.yahoo\.com|outlook\.(live|office|office365)\.com|mail\.proton\.me|app\.tuta\.com|.*\.mail\.[a-z.]+)$/, "email"],
  [/^gemini\.google\.com$/, "gemini"],
  [/^(chatgpt\.com|chat\.openai\.com|openai\.com)$/, "chatgpt"],
  [/^(perplexity\.ai)$/, "perplexity"],
  [/^(claude\.ai)$/, "claude"],
  [/^(copilot\.microsoft\.com)$/, "copilot"],
  [/^google\.[a-z.]{2,6}$|^(?:[a-z-]+\.)?google\.[a-z.]{2,6}$/, "google"],
  [/^(?:[a-z-]+\.)?bing\.com$/, "bing"],
  [/^(?:[a-z-]+\.)?duckduckgo\.com$/, "duckduckgo"],
  [/^(?:[a-z-]+\.)*yahoo\.(com|co\.[a-z]{2})$/, "yahoo"],
  [/^(?:[a-z-]+\.)?yandex\.[a-z.]{2,6}$/, "yandex"],
  [/^(?:[a-z-]+\.)?baidu\.com$/, "baidu"],
  [/^(?:[a-z-]+\.)?ecosia\.org$/, "ecosia"],
  [/^search\.brave\.com$/, "brave"],
  [/^(?:[a-z-]+\.)?(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "facebook"],
  [/^(?:[a-z-]+\.)?instagram\.com$/, "instagram"],
  [/^(t\.co|(?:[a-z-]+\.)?(x\.com|twitter\.com))$/, "x"],
  [/^(?:[a-z-]+\.)?tiktok\.com$/, "tiktok"],
  [/^(?:[a-z-]+\.)?(pinterest\.[a-z.]{2,6}|pin\.it)$/, "pinterest"],
  [/^(?:[a-z-]+\.)?(reddit\.com|redd\.it)$/, "reddit"],
  [/^(?:[a-z-]+\.)?(youtube\.com|youtu\.be)$/, "youtube"],
  [/^(?:[a-z-]+\.)?(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/^(?:[a-z-]+\.)?(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/^(?:[a-z-]+\.)?landfallgrenada\.com$/, "landfall"],
];

/** Which kind of site sent the visitor. Unknown sites are "referral". */
export function classifyReferrerHost(host: string): ViewSource {
  const bare = host.replace(/^(www|m|l|lm|mobile|out)\./, "");
  for (const [pattern, source] of HOST_CLASSES) if (pattern.test(host) || pattern.test(bare)) return source;
  return "referral";
}

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try { return new URL(url); } catch { return null; }
}

function surfaceOf(pathname: string, island?: string): ViewSource {
  if (pathname === "/explore" || pathname.startsWith("/explore/")) return "explore";
  if (pathname === "/search" || pathname.startsWith("/search/")) return "search";
  if (island && (pathname === `/${island}` || pathname.startsWith(`/${island}/`))) return "island";
  return "internal";
}

export type ViewAttribution = { source: ViewSource; referrerHost: string | null; utmSource: string | null };

/**
 * Where a listing view came from.
 *
 * `referrer` is `document.referrer`, which only changes on a full page
 * load. `landingHref` is the URL of that full page load; when it is not
 * this listing, the visitor got here by in-app navigation: the source is
 * the VakayGo surface they came through (`previousHref`, where the browser
 * exposes it), while the referring site and campaign tag stay those of the
 * landing, so every view of a visit keeps its acquisition.
 */
export function describeView(input: {
  href: string;
  referrer: string;
  landingHref?: string | null;
  previousHref?: string | null;
  island?: string;
}): ViewAttribution {
  const here = parse(input.href);
  if (!here) return { source: "direct", referrerHost: null, utmSource: null };
  const landing = parse(input.landingHref);
  const softNavigation = landing !== null && (landing.origin !== here.origin || landing.pathname !== here.pathname);
  const referrer = parse(input.referrer);
  const external = referrer && referrer.host !== here.host ? cleanReferrerHost(referrer.hostname) : null;
  const utmSource = cleanUtmSource((softNavigation ? landing! : here).searchParams.get("utm_source"));

  if (softNavigation) {
    const previous = parse(input.previousHref);
    const source = previous && previous.origin === here.origin ? surfaceOf(previous.pathname, input.island) : "internal";
    return { source, referrerHost: external, utmSource };
  }
  if (external) return { source: classifyReferrerHost(external), referrerHost: external, utmSource };
  if (referrer && referrer.host === here.host) return { source: surfaceOf(referrer.pathname, input.island), referrerHost: null, utmSource };
  return { source: utmSource ? "campaign" : "direct", referrerHost: null, utmSource };
}

/**
 * A scripted scroll or a synthetic event is not a person. Only input the
 * browser itself produced (pointer, wheel, touch, key) counts; a real
 * scroll always arrives with one of those.
 */
export const HUMAN_INPUT_EVENTS = ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"] as const;
export function isHumanInput(event: { isTrusted?: boolean }): boolean {
  return event.isTrusted === true;
}

// ── Server side ──────────────────────────────────────────────

/**
 * User agents that say they are not a person. The earlier list missed
 * script clients (curl, python-requests…), assistant fetchers that do not
 * contain "bot" (ChatGPT-User, GoogleOther…), link previewers, monitors
 * and automation drivers; an empty user agent is never a browser.
 */
const DECLARED_BOT_RE = new RegExp([
  "bot", "crawl", "spider", "slurp", "scrap", "fetch", "preview", "monitor", "uptime", "checker", "validator", "archiver",
  "facebookexternalhit", "meta-external", "whatsapp", "skypeuri", "embedly", "quora link",
  "headless", "phantomjs", "puppeteer", "playwright", "selenium", "webdriver", "cypress", "electron",
  "lighthouse", "pagespeed", "gtmetrix", "pingdom", "prerender", "chrome-lighthouse",
  "ahrefs", "semrush", "dataforseo", "screaming frog", "sitebulb", "bytespider",
  "chatgpt-user", "oai-search", "perplexity-user", "claude-user", "claude-web", "anthropic", "googleother", "google-extended",
  "google-inspectiontool", "google-read-aloud", "mediapartners", "feedfetcher", "apis-google", "storebot", "ia_archiver",
  "python", "curl\\/", "wget", "go-http-client", "node-fetch", "node\\.js", "undici", "axios", "okhttp", "java\\/", "libwww",
  "httpclient", "http_request", "guzzle", "ruby", "perl", "postman", "insomnia", "aiohttp", "httpx", "restsharp",
].join("|"), "i");

export function declaredBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (ua.length < 12) return true;
  if (!/^Mozilla\/\d|^Opera\//.test(ua)) return true;
  return DECLARED_BOT_RE.test(ua);
}

/** Coarse browser family. Never a version or a fingerprint. */
export function uaFamily(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (declaredBotUserAgent(ua)) return "bot";
  if (/FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|Line\/|MicroMessenger|; wv\)/i.test(ua)) return "in-app";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "edge";
  if (/OPR\/|Opera/.test(ua)) return "opera";
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/Firefox\/|FxiOS\//.test(ua)) return "firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "safari";
  return "other";
}

/**
 * Networks that run crawlers and servers, not travelers' phones. The
 * October 2026 audit traced 81% of recorded listing views to these
 * (Tencent Cloud, Huawei Cloud, a published Baiduspider block) and to
 * other hosting providers. Consumer ISPs are deliberately absent.
 */
const HOSTING_ASNS = new Set([
  132203, 45090, // Tencent Cloud
  55990, 136907, // Huawei Cloud
  37963, 45102, // Alibaba Cloud
  38365, 55967, // Baidu
  16509, 14618, // Amazon AWS
  396982, // Google Cloud
  8075, // Microsoft Azure
  14061, // DigitalOcean
  24940, // Hetzner
  16276, // OVH
  63949, // Akamai / Linode
  20473, // Vultr
  60068, 212238, // Datacamp / CDN77
  31898, // Oracle Cloud
]);

/** Published crawler address blocks, as IPv4 prefixes. */
const CRAWLER_IP_PREFIXES = [
  "116.179.33.", // Baiduspider (China Unicom AS4837 block)
];

export type BotReason = "crawler_network" | "hosting_network";

/** Why a view from an ordinary-looking browser is still not a traveler, or null. */
export function networkBotReason(input: { ip?: string | null; asn?: string | number | null }): BotReason | null {
  const ip = (input.ip ?? "").trim();
  if (ip && CRAWLER_IP_PREFIXES.some((prefix) => ip.startsWith(prefix))) return "crawler_network";
  const asn = Number(String(input.asn ?? "").replace(/^AS/i, ""));
  if (Number.isInteger(asn) && HOSTING_ASNS.has(asn)) return "hosting_network";
  return null;
}

/** ISO 3166-1 alpha-2 from an edge header, or null. */
export function cleanCountry(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z]{2}$/.test(value.trim()) ? value.trim().toUpperCase() : null;
}
