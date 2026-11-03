// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SessionPayload } from "@/server/session-validation";
const state = vi.hoisted(() => ({ verify: vi.fn(), token: "current-cookie" as string | undefined, created: 0, predicates: [] as SQL[], inserted: [] as Record<string, unknown>[], rows: [] as Record<string, unknown>[] }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: state.verify }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => { state.created++; return { select: () => new Query(), delete: () => new Query(), insert: () => ({ values: (value: Record<string, unknown>) => { state.inserted.push(value); return { returning: async () => [{ id: 4, ...value }] }; } }) }; } }));
import { GET, POST, DELETE } from "@/app/api/search-history/route";
class Query {
 from() { return this; } where(value: SQL) { state.predicates.push(value); return this; } orderBy() { return this; } limit() { return this; }
 then(resolve: (rows: Record<string, unknown>[]) => unknown) { return Promise.resolve(state.rows).then(resolve); }
}
const actor: SessionPayload = { userId: "actor-a", email: "a@example.invalid", role: "traveler", sessionVersion: 2, emailVerified: true };
const request = (method = "GET", expected?: string, body?: unknown) => new Request("http://localhost/api/search-history" + (expected === undefined ? "" : "?expectedUserId=" + expected), { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
beforeEach(() => { vi.clearAllMocks(); state.token = "current-cookie"; state.created = 0; state.predicates = []; state.inserted = []; state.rows = [{ id: 1, userId: actor.userId, query: "snorkel", filters: null }]; state.verify.mockReset().mockResolvedValue(actor); });
it("keeps anonymous reads empty and private while rejecting anonymous mutations", async () => {
 state.token = undefined; const read = await GET(request()); expect(read.status).toBe(200); expect(await read.json()).toEqual({ searches: [] }); expect(read.headers.get("Cache-Control")).toBe("private, no-store");
 expect((await POST(request("POST", undefined, { query: "beach" }))).status).toBe(401); expect((await DELETE(request("DELETE"))).status).toBe(401); expect(state.created).toBe(0);
});
it("rejects mismatched initiating accounts before creating any domain database client", async () => {
 expect((await GET(request("GET", "actor-b"))).status).toBe(409);
 expect((await POST(request("POST", undefined, { query: "beach", expectedUserId: "actor-b" }))).status).toBe(409);
 expect((await DELETE(request("DELETE", "actor-b"))).status).toBe(409); expect(state.created).toBe(0);
});
it("returns row objects with the authenticated account and scopes SQL to that account", async () => {
 const response = await GET(request("GET", actor.userId)); expect(await response.json()).toEqual({ userId: actor.userId, searches: state.rows }); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
 expect(new PgDialect().sqlToQuery(state.predicates[0]).params).toContain(actor.userId); expect(state.verify).toHaveBeenCalledTimes(2);
});
it.each([null, { ...actor, userId: "actor-b" }, { ...actor, sessionVersion: 3 }, { ...actor, email: "new@example.invalid" }, { ...actor, role: "operator" }, { ...actor, emailVerified: false }])("discards rows after a revoked or changed identity (%j)", async current => {
 state.verify.mockResolvedValueOnce(actor).mockResolvedValueOnce(current); const response = await GET(request()); expect(response.status).toBe(401); expect(await response.json()).not.toHaveProperty("searches");
});
it.each(["POST", "DELETE"])("checks current identity again before %s mutation", async method => {
 state.verify.mockResolvedValueOnce(actor).mockResolvedValueOnce({ ...actor, sessionVersion: 3 });
 const response = method === "POST" ? await POST(request(method, undefined, { query: "beach" })) : await DELETE(request(method));
 expect(response.status).toBe(401); expect(state.created).toBe(0); expect(state.inserted).toEqual([]);
});
it("saves trimmed valid text for the authenticated user and echoes the user ID", async () => {
 const response = await POST(request("POST", undefined, { expectedUserId: actor.userId, query: "  beach  ", filters: { island: "grenada" } })); expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ userId: actor.userId, search: { query: "beach", userId: actor.userId } }); expect(state.inserted).toEqual([{ userId: actor.userId, query: "beach", filters: { island: "grenada" } }]);
});
it("clears only the authenticated user's rows and echoes that identity", async () => {
 const response = await DELETE(request("DELETE", actor.userId)); expect(await response.json()).toEqual({ userId: actor.userId, ok: true }); expect(new PgDialect().sqlToQuery(state.predicates[0]).params).toContain(actor.userId);
});
it.each(["", "  ", 42, "a".repeat(121)])("rejects invalid search text before database work (%j)", async query => { expect((await POST(request("POST", undefined, { query }))).status).toBe(400); expect(state.created).toBe(0); });
it("preserves unauthorized responses for a revoked cookie", async () => { state.verify.mockResolvedValue(null); expect((await GET(request())).status).toBe(401); expect((await POST(request("POST", undefined, { query: "beach" }))).status).toBe(401); expect((await DELETE(request("DELETE"))).status).toBe(401); expect(state.created).toBe(0); });
