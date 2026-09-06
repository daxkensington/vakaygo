import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[], compare: vi.fn(), setCookie: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.rows }) }) }) }),
}));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: vi.fn() } }));
vi.mock("@/server/admin-auth", () => ({ setSessionCookie: mocks.setCookie }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { verifyCredentials } from "@/server/auth";
import { POST } from "@/app/api/auth/signin/route";

beforeEach(() => { mocks.rows = []; mocks.compare.mockReset(); mocks.setCookie.mockReset(); });
describe("verified password sign-in", () => {
  const base = { id: "u", email: "owner@example.com", name: "Owner", role: "operator", passwordHash: "stored", totpEnabled: false, sessionVersion: 7 };
  it("does not accept a password installed before email proof", async () => {
    mocks.rows = [{ ...base, emailVerified: false }];
    mocks.compare.mockResolvedValue(true);
    expect(await verifyCredentials(base.email, "attacker-password")).toBeNull();
    expect(mocks.compare).not.toHaveBeenCalled();
    const response = await POST(new Request("https://example.com/api/auth/signin", { method: "POST", body: JSON.stringify({ email: base.email, password: "attacker-password" }) }));
    expect(response.status).toBe(401);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("binds a verified password proof to its read epoch when issuing the session", async () => {
    mocks.rows = [{ ...base, emailVerified: true }];
    mocks.compare.mockResolvedValue(true);
    const response = await POST(new Request("https://example.com/api/auth/signin", { method: "POST", body: JSON.stringify({ email: base.email, password: "owner-password" }) }));
    expect(response.status).toBe(200);
    expect(mocks.setCookie).toHaveBeenCalledWith(expect.objectContaining({ id: "u", sessionVersion: 7, role: "operator" }));
    expect(await response.json()).not.toHaveProperty("user.totpSecret");
  });
  it("still requires an existing verified owner's TOTP", async () => {
    mocks.rows = [{ ...base, emailVerified: true, totpEnabled: true, totpSecret: "owner-factor" }];
    mocks.compare.mockResolvedValue(true);
    const response = await POST(new Request("https://example.com/api/auth/signin", { method: "POST", body: JSON.stringify({ email: base.email, password: "owner-password" }) }));
    expect(response.status).toBe(401);
    expect((await response.json()).requires2fa).toBe(true);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
