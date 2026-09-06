import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  current: vi.fn(), auth: vi.fn(), query: vi.fn(),
}));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: mocks.current }));
vi.mock("@/server/admin-auth", () => ({ requireUser: mocks.auth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "old-session" }) }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => mocks.query }));
vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: () => ({
    select: () => {
      const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, orderBy: () => chain,
        limit: async () => [{ id: "private-message", content: "must not reach revoked subscriber" }] };
      return chain;
    },
  }),
}));
import { GET } from "@/app/api/messages/stream/route";
import { POST } from "@/app/api/push/subscribe/route";

beforeEach(() => { mocks.current.mockReset(); mocks.auth.mockReset(); mocks.query.mockReset(); });
describe("notification identity persistence", () => {
  it("closes an already-open stream before delivering newly read messages after revocation", async () => {
    mocks.current.mockResolvedValueOnce({ userId: "owner", sessionVersion: 0 }).mockResolvedValue(null);
    const response = await GET();
    const body = await response.text();
    expect(body).toContain("event: connected");
    expect(body).not.toContain("private-message");
    expect(body).not.toContain("must not reach");
    expect(mocks.current).toHaveBeenCalledTimes(2);
  });
  it("does not open a stream for an already-revoked session", async () => {
    mocks.current.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("does not allow preverified push enrollment", async () => {
    mocks.auth.mockResolvedValue({ ok: true, userId: "owner", emailVerified: false, sessionVersion: 0 });
    expect((await POST(new Request("https://example.com/api/push/subscribe", { method: "POST" }))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("sends the proof epoch to atomic push enrollment and rejects a stale result", async () => {
    mocks.auth.mockResolvedValue({ ok: true, userId: "owner", emailVerified: true, sessionVersion: 4 });
    mocks.query.mockResolvedValue([{ saved: false }]);
    const response = await POST(new Request("https://example.com/api/push/subscribe", {
      method: "POST", body: JSON.stringify({ endpoint: "https://push.example.test/synthetic", keys: { p256dh: "synthetic-key", auth: "synthetic-auth" } }),
    }));
    expect(response.status).toBe(409);
    expect(mocks.query.mock.calls[0].slice(1, 3)).toEqual(["owner", 4]);
  });
});
