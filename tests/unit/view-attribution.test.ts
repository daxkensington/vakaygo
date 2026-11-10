// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyReferrerHost,
  cleanCountry,
  cleanReferrerHost,
  cleanUtmSource,
  cleanViewSource,
  declaredBotUserAgent,
  describeView,
  isHumanInput,
  networkBotReason,
  uaFamily,
  VIEW_SOURCES,
} from "@/lib/view-attribution";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const listing = "https://vakaygo.com/dominican-republic/la-ex-tours";

describe("describeView", () => {
  it("names the search engine, assistant or site that sent a landing visitor instead of 'direct'", () => {
    expect(describeView({ href: listing, referrer: "https://www.google.com/", landingHref: listing })).toEqual({ source: "google", referrerHost: "www.google.com", utmSource: null });
    expect(describeView({ href: listing, referrer: "https://www.bing.com/search?q=x", landingHref: listing }).source).toBe("bing");
    expect(describeView({ href: listing, referrer: "https://landfallgrenada.com/guides/waterfalls", landingHref: listing }).source).toBe("landfall");
    expect(describeView({ href: listing, referrer: "https://some-travel-blog.example/post", landingHref: listing })).toEqual({ source: "referral", referrerHost: "some-travel-blog.example", utmSource: null });
  });

  it("keeps the campaign tag, which is how ChatGPT visits identify themselves", () => {
    expect(describeView({ href: `${listing}?utm_source=chatgpt.com`, referrer: "", landingHref: `${listing}?utm_source=chatgpt.com` })).toEqual({ source: "campaign", referrerHost: null, utmSource: "chatgpt.com" });
    expect(describeView({ href: `${listing}?utm_source=ChatGPT.com`, referrer: "https://chatgpt.com/", landingHref: `${listing}?utm_source=ChatGPT.com` })).toEqual({ source: "chatgpt", referrerHost: "chatgpt.com", utmSource: "chatgpt.com" });
  });

  it("reports no referrer and no tag as direct", () => {
    expect(describeView({ href: listing, referrer: "", landingHref: listing })).toEqual({ source: "direct", referrerHost: null, utmSource: null });
    expect(describeView({ href: listing, referrer: "" })).toEqual({ source: "direct", referrerHost: null, utmSource: null });
  });

  it("classifies a full page load from another VakayGo page by its surface and stores no referring site", () => {
    expect(describeView({ href: listing, referrer: "https://vakaygo.com/explore?island=dominican-republic", landingHref: listing, island: "dominican-republic" })).toEqual({ source: "explore", referrerHost: null, utmSource: null });
    expect(describeView({ href: listing, referrer: "https://vakaygo.com/dominican-republic", landingHref: listing, island: "dominican-republic" }).source).toBe("island");
    expect(describeView({ href: listing, referrer: "https://vakaygo.com/guides/x", landingHref: listing, island: "dominican-republic" }).source).toBe("internal");
  });

  it("keeps the landing's referring site and campaign on views reached by in-app navigation", () => {
    const view = describeView({
      href: listing,
      referrer: "https://www.google.com/",
      landingHref: "https://vakaygo.com/explore?island=dominican-republic&utm_source=newsletter-nov",
      previousHref: "https://vakaygo.com/explore?island=dominican-republic&utm_source=newsletter-nov",
      island: "dominican-republic",
    });
    expect(view).toEqual({ source: "explore", referrerHost: "www.google.com", utmSource: "newsletter-nov" });
    expect(describeView({ href: listing, referrer: "", landingHref: "https://vakaygo.com/", island: "dominican-republic" })).toEqual({ source: "internal", referrerHost: null, utmSource: null });
  });

  it("never throws on an unusable URL", () => {
    expect(describeView({ href: "not a url", referrer: "also not" })).toEqual({ source: "direct", referrerHost: null, utmSource: null });
    expect(describeView({ href: listing, referrer: "android-app://com.google.android.gm/", landingHref: listing }).referrerHost).toBe("com.google.android.gm");
  });
});

describe("referrer classes", () => {
  it.each([
    ["google.co.uk", "google"], ["www.google.com", "google"], ["gemini.google.com", "gemini"], ["mail.google.com", "email"],
    ["chatgpt.com", "chatgpt"], ["chat.openai.com", "chatgpt"], ["www.perplexity.ai", "perplexity"], ["claude.ai", "claude"],
    ["duckduckgo.com", "duckduckgo"], ["search.yahoo.com", "yahoo"], ["yandex.ru", "yandex"], ["www.baidu.com", "baidu"],
    ["l.facebook.com", "facebook"], ["m.facebook.com", "facebook"], ["l.instagram.com", "instagram"], ["t.co", "x"],
    ["www.reddit.com", "reddit"], ["www.youtube.com", "youtube"], ["www.pinterest.ca", "pinterest"],
    ["www.landfallgrenada.com", "landfall"], ["tripadvisor.com", "referral"],
  ])("%s is %s", (host, source) => {
    expect(classifyReferrerHost(host)).toBe(source);
    expect(VIEW_SOURCES).toContain(source);
  });
});

describe("input cleaning", () => {
  it("accepts only known sources, bare hostnames and plain campaign tags", () => {
    expect(cleanViewSource("explore")).toBe("explore");
    expect(cleanViewSource("'; drop table listing_views; --")).toBe("direct");
    expect(cleanViewSource(undefined)).toBe("direct");
    expect(cleanReferrerHost("WWW.Google.com")).toBe("www.google.com");
    expect(cleanReferrerHost("https://www.google.com/search?q=secret")).toBeNull();
    expect(cleanReferrerHost("203.0.113.9")).toBeNull();
    expect(cleanReferrerHost("a".repeat(130) + ".com")).toBeNull();
    expect(cleanReferrerHost(42)).toBeNull();
    expect(cleanUtmSource(" ChatGPT.com ")).toBe("chatgpt.com");
    expect(cleanUtmSource("<script>")).toBeNull();
    expect(cleanUtmSource("x".repeat(65))).toBeNull();
    expect(cleanCountry("ca")).toBe("CA");
    expect(cleanCountry("CAN")).toBeNull();
    expect(cleanCountry(null)).toBeNull();
  });
});

describe("who is not a person", () => {
  it("still recognises the user agents the old filter caught", () => {
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; Baiduspider/2.0)", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36", "facebookexternalhit/1.1", "Mozilla/5.0 (compatible; AhrefsBot/7.0)"]) {
      expect(declaredBotUserAgent(ua)).toBe(true);
    }
  });

  it("also recognises script clients, assistant fetchers and empty user agents the old filter let through", () => {
    for (const ua of ["", "curl/8.4.0", "python-requests/2.32.3", "Go-http-client/2.0", "node", "axios/1.7.2", "okhttp/4.12.0", "Java/17.0.2",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; GoogleOther)",
      "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Playwright/1.48",
      "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)", "Mozilla/5.0 (Macintosh) Chrome-Lighthouse"]) {
      expect(declaredBotUserAgent(ua), ua).toBe(true);
    }
  });

  it("does not turn away real browsers, including in-app ones", () => {
    for (const ua of [CHROME, SAFARI_IOS,
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0;FBDV/iPhone15,2]",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]"]) {
      expect(declaredBotUserAgent(ua), ua).toBe(false);
    }
  });

  it("stores a coarse browser family, never a version", () => {
    expect(uaFamily(CHROME)).toBe("chrome");
    expect(uaFamily(SAFARI_IOS)).toBe("safari");
    expect(uaFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")).toBe("edge");
    expect(uaFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe("firefox");
    expect(uaFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0")).toBe("in-app");
    expect(uaFamily("curl/8.4.0")).toBe("bot");
  });

  it("flags the published Baiduspider block and hosting networks, and leaves consumer networks alone", () => {
    expect(networkBotReason({ ip: "116.179.33.47" })).toBe("crawler_network");
    expect(networkBotReason({ ip: "116.179.34.47" })).toBeNull();
    expect(networkBotReason({ ip: "203.0.113.9", asn: "132203" })).toBe("hosting_network");
    expect(networkBotReason({ ip: "203.0.113.9", asn: "AS55990" })).toBe("hosting_network");
    expect(networkBotReason({ ip: "203.0.113.9", asn: 16509 })).toBe("hosting_network");
    expect(networkBotReason({ ip: "203.0.113.9", asn: "4837" })).toBeNull(); // China Unicom: a consumer ISP
    expect(networkBotReason({ ip: "203.0.113.9", asn: "7922" })).toBeNull(); // Comcast
    expect(networkBotReason({ ip: "203.0.113.9", asn: null })).toBeNull();
    expect(networkBotReason({ ip: "unknown" })).toBeNull();
  });

  it("counts only input the browser itself produced", () => {
    expect(isHumanInput({ isTrusted: true })).toBe(true);
    expect(isHumanInput({ isTrusted: false })).toBe(false);
    expect(isHumanInput({})).toBe(false);
  });
});
