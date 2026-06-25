import { describe, it, expect } from "vitest";
import {
  rateLimit,
  getEndpointType,
  getClientIp,
  RATE_LIMITS,
} from "@/lib/rate-limit";

describe("getEndpointType", () => {
  it("classifies admin paths", () => {
    expect(getEndpointType("/api/admin/users", "GET")).toBe("admin");
  });
  it("classifies auth paths", () => {
    expect(getEndpointType("/api/auth/signin", "POST")).toBe("auth");
  });
  it("classifies AI paths", () => {
    expect(getEndpointType("/api/ai/generate-image", "POST")).toBe("ai");
    expect(getEndpointType("/api/chat", "POST")).toBe("ai");
  });
  it("classifies non-GET as write", () => {
    expect(getEndpointType("/api/listings", "POST")).toBe("write");
  });
  it("classifies GET as read", () => {
    expect(getEndpointType("/api/listings", "GET")).toBe("read");
  });
});

describe("getClientIp", () => {
  it("prefers the platform-set x-real-ip over client-controlled XFF", () => {
    // x-real-ip is set by the platform and cannot be spoofed by a client
    // prepending X-Forwarded-For entries, so it must win.
    const h = new Headers({
      "x-real-ip": "9.9.9.9",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });
    expect(getClientIp(h)).toBe("9.9.9.9");
  });
  it("uses x-vercel-forwarded-for when x-real-ip is absent", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "8.8.8.8" });
    expect(getClientIp(h)).toBe("8.8.8.8");
  });
  it("falls back to the RIGHTMOST XFF hop (not the spoofable leftmost)", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(h)).toBe("5.6.7.8");
  });
  it("returns 'unknown' when no header present", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("rateLimit", () => {
  it("allows up to maxTokens, then 429s", () => {
    const ip = `test-${Math.random()}`;
    const max = RATE_LIMITS.auth.maxTokens;

    for (let i = 0; i < max; i++) {
      const r = rateLimit(ip, "auth");
      expect(r.allowed).toBe(true);
    }
    const blocked = rateLimit(ip, "auth");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("isolates buckets per ip + endpoint type", () => {
    const a = `iso-${Math.random()}`;
    const b = `iso-${Math.random()}`;
    rateLimit(a, "auth");
    const r = rateLimit(b, "auth");
    expect(r.allowed).toBe(true);
    // Same ip, different bucket type → fresh tokens
    const cross = rateLimit(a, "read");
    expect(cross.allowed).toBe(true);
  });
});
