import { expect, it } from "vitest";
import { getEndpointType, rateLimit } from "@/lib/rate-limit";
it("allows ordinary session reads without consuming login attempts", () => {
  const ip = "session-navigation-test";
  for (let n = 0; n < 10; n++) expect(rateLimit(ip, getEndpointType("/api/auth/session", "GET")).allowed).toBe(true);
  for (let n = 0; n < 5; n++) expect(rateLimit(ip, getEndpointType("/api/auth/signin", "POST")).allowed).toBe(true);
  expect(rateLimit(ip, getEndpointType("/api/auth/signin", "POST")).allowed).toBe(false);
});
it("keeps state-changing and similarly named auth routes in the stricter bucket", () => {
  expect(getEndpointType("/api/auth/session", "POST")).toBe("auth");
  expect(getEndpointType("/api/auth/session-extra", "GET")).toBe("auth");
  expect(getEndpointType("/api/auth/verify-email", "POST")).toBe("auth");
  expect(getEndpointType("/api/auth/magic-link", "POST")).toBe("auth");
  expect(getEndpointType("/api/auth/session", "HEAD")).toBe("session");
});
