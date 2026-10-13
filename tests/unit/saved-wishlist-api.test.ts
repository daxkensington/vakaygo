import { beforeEach, expect, it, vi } from "vitest";
const a = "41000000-0000-4000-8000-000000000001", b = "41000000-0000-4000-8000-000000000002";
const listingId = "42000000-0000-4000-8000-000000000001", collectionId = "43000000-0000-4000-8000-000000000001";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
const db = vi.hoisted(() => ({ query: vi.fn<(text: string, values: unknown[]) => Promise<Record<string, unknown>[]>>(), transaction: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireUser: auth.requireUser }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: db.query, transaction: db.transaction }) }));
vi.mock("@/lib/env", () => ({ env: { DATABASE_URL: "postgresql://synthetic.invalid/test" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import * as saved from "@/app/api/saved/route";
import * as collections from "@/app/api/wishlist-collections/route";
import * as items from "@/app/api/wishlist-collections/items/route";
import * as move from "@/app/api/wishlist-collections/move/route";
const actor = { ok: true, userId: a, sessionVersion: 2, role: "traveler", emailVerified: true };
const body = { expectedUserId: a, listingId, collectionId, id: collectionId, name: "Plans" };
function request(method: string, data: unknown = body) {
  const url = `https://vakaygo.com/api/synthetic?expectedUserId=${a}&listingId=${listingId}&collectionId=${collectionId}&id=${collectionId}`;
  return new Request(url, { method, ...(method === "GET" || method === "DELETE" && data === null ? {} : { body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }) });
}
beforeEach(() => {
  vi.clearAllMocks(); auth.requireUser.mockResolvedValue(actor);
  db.transaction.mockImplementation(async (work: (tx: { query: typeof db.query }) => Promise<Record<string, unknown>[]>[]) => Promise.all(work({ query: db.query })));
  db.query.mockResolvedValue([{ actorExists: true, listingExists: true, collectionExists: true, savedExists: true,
    saved: [], collections: [], items: [], collection: { id: collectionId, name: "Plans" } }]);
});
const routes: [string, (request: Request) => Promise<Response>, string][] = [
  ["saved GET", saved.GET, "GET"], ["saved POST", saved.POST, "POST"], ["saved DELETE", saved.DELETE, "DELETE"],
  ["collections GET", collections.GET, "GET"], ["collections POST", collections.POST, "POST"], ["collections PUT", collections.PUT, "PUT"], ["collections DELETE", collections.DELETE, "DELETE"],
  ["items GET", items.GET, "GET"], ["items POST", items.POST, "POST"], ["items DELETE", items.DELETE, "DELETE"], ["move POST", move.POST, "POST"],
];
it.each(routes)("%s rejects an unavailable current session before any data access", async (_name, handler, method) => {
  auth.requireUser.mockResolvedValue({ ok: false, error: Response.json({ error: "Unauthorized" }, { status: 401 }) });
  expect((await handler(request(method))).status).toBe(401); expect(db.query).not.toHaveBeenCalled();
});
it.each([saved.POST, saved.DELETE, collections.POST, collections.PUT, items.POST, move.POST])("rejects a stale visible actor when another cookie account is current before writing", async handler => {
  const res = await handler(request("POST", { ...body, expectedUserId: b }));
  expect(res.status).toBe(409); expect(db.query).not.toHaveBeenCalled();
});
it("pins read and query-based delete actor expectations too", async () => {
  const req = new Request(`https://vakaygo.com/api/synthetic?expectedUserId=${b}&id=${collectionId}&collectionId=${collectionId}&listingId=${listingId}`);
  for (const handler of [saved.GET, collections.GET, items.GET, collections.DELETE, items.DELETE]) expect((await handler(req)).status).toBe(409);
  expect(db.query).not.toHaveBeenCalled();
});
it.each([null, [], "invalid", { expectedUserId: a, listingId: {} }, { listingId }])("rejects malformed saved input before a DB statement (%j)", async data => {
  expect((await saved.POST(request("POST", data))).status).toBe(400); expect(db.query).not.toHaveBeenCalled();
});
it("retains owner-scoped memberships and numeric counts in actual GET route receipts", async () => {
  db.query.mockResolvedValueOnce([{ actorExists: true, saved: [{ id: listingId, collectionIds: [collectionId], image: "https://images.unsplash.com/synthetic", reviewSource: "google" }] }])
    .mockResolvedValueOnce([{ actorExists: true, collections: [{ id: collectionId, name: "Plans", itemCount: 1 }] }]);
  expect(await (await saved.GET(request("GET"))).json()).toEqual({ userId: a, saved: [{ id: listingId, collectionIds: [collectionId], image: "https://images.unsplash.com/synthetic", reviewSource: "google" }] });
  expect((await (await collections.GET(request("GET"))).json()).collections[0].itemCount).toBe(1);
});
it("returns explicit saved/remove/move receipts only after the actor-locked transaction completes", async () => {
  expect(await (await saved.POST(request("POST"))).json()).toEqual({ userId: a, saved: true, listingId });
  expect(await (await saved.DELETE(request("DELETE"))).json()).toEqual({ userId: a, removed: true, listingId });
  expect(await (await move.POST(request("POST"))).json()).toEqual({ userId: a, moved: true, listingId, collectionIds: [collectionId] });
  expect(await (await move.POST(request("POST", { ...body, collectionId: null }))).json()).toEqual({ userId: a, moved: true, listingId, collectionIds: [] });
  expect(db.transaction).toHaveBeenCalledTimes(4); for (const [,values] of db.query.mock.calls) expect(values.slice(0,3)).toEqual([a,2,"traveler"]);
});
it("rejects a missing/private listing result without returning a saved success", async () => {
  db.query.mockResolvedValue([{ actorExists: true, collectionExists: true, listingExists: false, savedExists: false }]);
  expect((await saved.POST(request("POST"))).status).toBe(404); expect((await items.POST(request("POST"))).status).toBe(404); expect((await move.POST(request("POST"))).status).toBe(404);
});
it("rejects another owner's collection without a successful move or item receipt", async () => {
  db.query.mockResolvedValue([{ actorExists: true, collectionExists: false, listingExists: true, savedExists: false }]);
  expect((await items.GET(request("GET"))).status).toBe(404); expect((await items.POST(request("POST"))).status).toBe(404);
  expect((await items.DELETE(request("DELETE"))).status).toBe(404); expect((await move.POST(request("POST"))).status).toBe(404);
});
it("a session epoch change at the SQL boundary fails instead of acknowledging mutation", async () => {
  db.query.mockResolvedValue([{ actorExists: false, listingExists: true, collectionExists: true, savedExists: true }]);
  expect((await saved.POST(request("POST"))).status).toBe(401); expect((await move.POST(request("POST"))).status).toBe(401);
});
it("trims collection names and validates payload limits/types before data writes", async () => {
  const res = await collections.POST(request("POST", { expectedUserId: a, name: "  Plans  ", description: " Notes " }));
  expect(res.status).toBe(201); expect(db.query.mock.calls[1][1].slice(3)).toEqual(["Plans", "Notes"]);
  db.query.mockClear();
  for (const name of [" ", 123, "x".repeat(129)]) expect((await collections.POST(request("POST", { expectedUserId: a, name }))).status).toBe(400);
  expect((await collections.PUT(request("PUT", { expectedUserId: a, id: collectionId, description: {} }))).status).toBe(400);
  expect(db.query).not.toHaveBeenCalled();
});
it("database failure returns a safe retryable error and no success markers", async () => {
  db.query.mockRejectedValue(new Error("synthetic-private-canary")); const res = await move.POST(request("POST")); const data = await res.json();
  expect(res.status).toBe(500); expect(JSON.stringify(data)).not.toContain("synthetic-private-canary"); expect(data.moved).toBeUndefined();
});
