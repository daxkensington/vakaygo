// @vitest-environment node
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ currentSession: vi.fn() }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: state.currentSession }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "offline", getEndpointType: () => "api", rateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/env", () => ({}));
import { config, proxy } from "@/proxy";

beforeEach(() => { state.currentSession.mockReset().mockResolvedValue(null); });

it.each(["/api/blog/proof.png", "/api/blog/proof.svg", "/api/upload/photo.jpg", "/api/admin/listings/report.webp", "/api", "/api/notifications"])(
  "runs the session boundary for extension-bearing API paths: %s", path => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: `https://test.invalid${path}` })).toBe(true);
  },
);

it.each(["/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/photos/hero.png"])("preserves ordinary asset exclusions: %s", path => {
  expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: `https://test.invalid${path}` })).toBe(false);
});

it.each(["GET", "PUT", "DELETE"])("rejects a revoked admin cookie on an actual image-suffixed blog API URL (%s)", async method => {
  const url = "https://test.invalid/api/blog/proof.png";
  expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(true);
  const response = await proxy(new NextRequest(url, { method, headers: { cookie: "session=synthetic-old-admin-token" } }));
  expect(response.status).toBe(401);
  expect(state.currentSession).toHaveBeenCalledWith("synthetic-old-admin-token");
  expect(response.headers.get("x-middleware-next")).toBeNull();
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
