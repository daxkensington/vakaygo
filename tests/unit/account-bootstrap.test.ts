import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-must-be-at-least-32-characters-long";
  process.env.DATABASE_URL = "postgres://test:test@localhost/test";
});
describe("durable session identity", () => {
  it("rejects legacy unverified and revoked sessions while preserving verified legacy sessions", async () => {
    const { sessionMatchesUser } = await import("@/server/session-validation");
    const session = { userId: "u", email: "owner@example.com", role: "operator" };
    const user = { email: session.email, role: session.role, email_verified: true, session_version: 0 };
    expect(sessionMatchesUser(session, user)).toBe(true);
    expect(sessionMatchesUser(session, { ...user, email_verified: false })).toBe(false);
    expect(sessionMatchesUser(session, { ...user, session_version: 1 })).toBe(false);
    expect(sessionMatchesUser({ ...session, sessionVersion: 1 }, { ...user, session_version: 2 })).toBe(false);
    expect(sessionMatchesUser({ ...session, sessionVersion: 2 }, { ...user, session_version: 2 })).toBe(true);
  });
  it("rejects stale roles and email identity mismatches", async () => {
    const { sessionMatchesUser } = await import("@/server/session-validation");
    const session = { userId: "u", email: "owner@example.com", role: "admin", sessionVersion: 0 };
    const user = { email: session.email, role: "operator", email_verified: true, session_version: 0 };
    expect(sessionMatchesUser(session, user)).toBe(false);
    expect(sessionMatchesUser({ ...session, role: "operator" }, { ...user, email: "other@example.com" })).toBe(false);
  });
  it("allows explicitly versioned new traveler guests but no unverified business privileges", async () => {
    const { sessionMatchesUser } = await import("@/server/session-validation");
    const session = { userId: "u", email: "guest@example.com", role: "traveler", sessionVersion: 0 };
    const user = { email: session.email, role: "traveler", email_verified: false, session_version: 0 };
    expect(sessionMatchesUser(session, user)).toBe(true);
    expect(sessionMatchesUser({ ...session, role: "operator" }, { ...user, role: "operator" })).toBe(false);
    expect(sessionMatchesUser({ ...session, role: "admin" }, { ...user, role: "admin" })).toBe(false);
  });
  it("requires explicit nonnegative integer epochs when issuing a JWT", async () => {
    const { createSessionToken } = await import("@/server/session-validation");
    for (const sessionVersion of [-1, 1.5, NaN, undefined]) {
      await expect(createSessionToken({ id: "u", email: "a@b.com", role: "traveler", sessionVersion: sessionVersion as number })).rejects.toThrow("Session epoch required");
    }
  });
  it("does not permit bcrypt truncation or weak newly selected passwords", async () => {
    const { validNewPassword } = await import("@/server/email-identity");
    expect(validNewPassword("owner-password-123")).toBe(true);
    expect(validNewPassword("short")).toBe(false);
    expect(validNewPassword("x".repeat(73))).toBe(false);
    expect(validNewPassword("é".repeat(37))).toBe(false);
    expect(validNewPassword("x".repeat(72))).toBe(true);
  });
});
