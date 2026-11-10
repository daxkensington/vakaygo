// @vitest-environment node
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ currentSession: vi.fn() }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: state.currentSession }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "offline", getEndpointType: () => "api", rateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/env", () => ({}));
import { config, proxy } from "@/proxy";
import { canonicalHostRedirect } from "@/lib/canonical-host";

beforeEach(() => { state.currentSession.mockReset().mockResolvedValue(null); });

describe("canonicalHostRedirect", () => {
  it.each([
    ["www.vakaygo.com", "/", "", "https://vakaygo.com/"],
    ["www.vakaygo.com", "/grenada/dive-grenada", "", "https://vakaygo.com/grenada/dive-grenada"],
    ["WWW.VAKAYGO.COM", "/explore", "?island=grenada&type=stay", "https://vakaygo.com/explore?island=grenada&type=stay"],
    ["vakaygo.vercel.app", "/best-hotels-santorini", "", "https://vakaygo.com/best-hotels-santorini"],
    ["vakaygo.vercel.app:443", "/sitemap.xml", "", "https://vakaygo.com/sitemap.xml"],
    ["www.vakaygo.com.", "/robots.txt", "", "https://vakaygo.com/robots.txt"],
    ["www.vakaygo.com", "/apiary", "", "https://vakaygo.com/apiary"],
  ])("redirects %s%s%s", (host, pathname, search, expected) => {
    expect(canonicalHostRedirect(host, pathname, search, "GET")).toBe(expected);
    expect(canonicalHostRedirect(host, pathname, search, "HEAD")).toBe(expected);
  });

  it.each([
    "vakaygo.com",
    "localhost:3000",
    "vakaygo-btebtpkz6-englandsfinest.vercel.app",
    "vakaygo-git-fix-seo-englandsfinest.vercel.app",
    "evil-www.vakaygo.com.example.org",
    "staging.vakaygo.com",
    "",
  ])("serves %s as is", (host) => {
    expect(canonicalHostRedirect(host, "/grenada", "", "GET")).toBeNull();
  });

  it("serves a request with no host header as is", () => {
    expect(canonicalHostRedirect(null, "/grenada", "", "GET")).toBeNull();
    expect(canonicalHostRedirect(undefined, "/grenada", "", "GET")).toBeNull();
  });

  it.each([
    "/api",
    "/api/cron/availability",
    "/api/webhooks/stripe",
    "/api/auth/google/callback",
    "/_next/static/chunks/app.js",
    "/_vercel/insights/script.js",
    "/.well-known/apple-app-site-association",
  ])("never redirects %s", (pathname) => {
    expect(canonicalHostRedirect("www.vakaygo.com", pathname, "", "GET")).toBeNull();
    expect(canonicalHostRedirect("vakaygo.vercel.app", pathname, "", "GET")).toBeNull();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("never redirects a %s", (method) => {
    expect(canonicalHostRedirect("www.vakaygo.com", "/contact", "", method)).toBeNull();
  });

  it("cannot be turned into an open redirect", () => {
    expect(canonicalHostRedirect("www.vakaygo.com", "//evil.example/path", "", "GET")).toBeNull();
    const target = canonicalHostRedirect("www.vakaygo.com", "/a", "?next=https://evil.example", "GET");
    expect(new URL(target!).origin).toBe("https://vakaygo.com");
  });
});

describe("proxy host handling", () => {
  it.each(["www.vakaygo.com", "vakaygo.vercel.app"])("308s a page on %s to the apex with path, query and security headers", async (host) => {
    const url = `https://${host}/explore?island=grenada&type=stay`;
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(true);
    const response = await proxy(new NextRequest(url, { headers: { host } }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://vakaygo.com/explore?island=grenada&type=stay");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(state.currentSession).not.toHaveBeenCalled();
  });

  it("308s the www home page", async () => {
    const url = "https://www.vakaygo.com/";
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(true);
    const response = await proxy(new NextRequest(url, { headers: { host: "www.vakaygo.com" } }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://vakaygo.com/");
  });

  it.each([
    ["vakaygo.com", "/grenada"],
    ["vakaygo-btebtpkz6-englandsfinest.vercel.app", "/grenada"],
    ["localhost:3000", "/grenada"],
    ["vakaygo.vercel.app", "/api/cron/availability"],
    ["www.vakaygo.com", "/api/listings"],
  ])("passes %s%s through", async (host, pathname) => {
    const response = await proxy(new NextRequest(`https://${host}${pathname}`, { headers: { host } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect a POST on www", async () => {
    const response = await proxy(new NextRequest("https://www.vakaygo.com/contact", { method: "POST", headers: { host: "www.vakaygo.com" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
