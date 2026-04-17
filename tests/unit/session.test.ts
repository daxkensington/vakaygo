import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // env.ts validates AUTH_SECRET on first access — set a test value.
  process.env.AUTH_SECRET = "test-secret-must-be-at-least-32-characters-long";
  process.env.DATABASE_URL = "postgres://test:test@localhost/test";
});

// Import after env vars are set so the env validator doesn't throw.
async function loadAuth() {
  return import("@/server/admin-auth");
}

describe("session token round-trip", () => {
  it("creates a token that verifies back to the same claims", async () => {
    const { createSessionToken, verifySessionToken } = await loadAuth();

    const token = await createSessionToken({
      id: "user-123",
      email: "alice@example.com",
      name: "Alice",
      role: "admin",
    });

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT format

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-123");
    expect(payload!.email).toBe("alice@example.com");
    expect(payload!.role).toBe("admin");
  });

  it("returns null for a tampered token", async () => {
    const { createSessionToken, verifySessionToken } = await loadAuth();
    const token = await createSessionToken({
      id: "u",
      email: "e@x.com",
      role: "traveler",
    });
    const tampered = token.slice(0, -4) + "AAAA";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    const { verifySessionToken } = await loadAuth();
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

});
