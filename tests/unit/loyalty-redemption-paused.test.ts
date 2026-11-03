// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/server/session-validation";
const state = vi.hoisted(() => ({ token: "fixture-session" as string | undefined, verify: vi.fn(), data: vi.fn(), transactions: vi.fn(), redeem: vi.fn() }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: state.verify }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("@/server/loyalty", () => ({ getUserLoyaltyData: state.data, getLoyaltyTransactions: state.transactions, redeemPoints: state.redeem, MIN_REDEMPTION_POINTS: 500 }));
import { GET, POST } from "@/app/api/loyalty/route";
const actor: SessionPayload = { userId: "loyalty-actor", email: "actor@example.invalid", role: "traveler", sessionVersion: 2, emailVerified: true };
const request = (points: unknown) => new Request("http://localhost/api/loyalty", { method: "POST", body: JSON.stringify({ points, bookingId: "df7e57aa-01ee-4d3d-9630-9373af4b28d5" }), headers: { "content-type": "application/json" } });
beforeEach(() => { vi.clearAllMocks(); state.token = "fixture-session"; state.verify.mockReset().mockResolvedValue(actor); state.data.mockResolvedValue({ points: 5000, tier: "explorer" }); state.transactions.mockResolvedValue([]); state.redeem.mockResolvedValue({ creditAmount: 20, newTotal: 4000, newTier: "explorer" }); });
it.each([500, 1000, 5000])("pauses valid redemption requests without reading or debiting a valid account balance (%i)", async points => {
 const response = await POST(request(points)); expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "Rewards redemption is currently unavailable.", code: "REWARDS_UNAVAILABLE" }); expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(state.verify).toHaveBeenCalledWith("fixture-session"); expect(state.data).not.toHaveBeenCalled(); expect(state.transactions).not.toHaveBeenCalled(); expect(state.redeem).not.toHaveBeenCalled();
});
it.each([null, 0, -10, 499, "500"])("preserves invalid-points validation (%j)", async points => { const response = await POST(request(points)); expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "Minimum redemption is 500 points" }); expect(state.redeem).not.toHaveBeenCalled(); });
it("preserves missing and revoked-session rejection before redemption validation", async () => {
 state.token = undefined; expect((await POST(request(1000))).status).toBe(401); state.token = "revoked"; state.verify.mockResolvedValue(null); expect((await POST(request(1000))).status).toBe(401); expect(state.data).not.toHaveBeenCalled(); expect(state.redeem).not.toHaveBeenCalled();
});
it.each(["traveler", "operator", "admin"])("preserves authenticated %s history and user scoping", async role => {
 state.verify.mockResolvedValue({ ...actor, role }); state.transactions.mockResolvedValue([{ id: 1, points: 100, type: "earned_booking" }]);
 const response = await GET(new Request("http://localhost/api/loyalty?page=2&filter=earned")); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ points: 5000, tier: "explorer", page: 2, hasMore: false, transactions: [{ id: 1, points: 100 }] }); expect(state.data).toHaveBeenCalledWith(actor.userId); expect(state.transactions).toHaveBeenCalledWith(actor.userId, { limit: 20, offset: 20, filter: "earned" }); expect(state.redeem).not.toHaveBeenCalled();
});
