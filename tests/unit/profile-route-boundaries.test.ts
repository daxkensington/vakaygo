import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const state = vi.hoisted(() => ({ valid: true, userId: "10000000-0000-4000-8000-000000000001", writes: [] as { values: Record<string, unknown>; sql: string; params: unknown[] }[], accepted: true, dbCalls: 0 }));
vi.mock("@/server/admin-auth", () => ({ requireUser: async () => state.valid ? ({ ok: true, userId: state.userId, role: "traveler", sessionVersion: 3 }) : ({ ok: false, error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => { state.dbCalls++; return {}; } }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ update: () => ({ set: (values: Record<string, unknown>) => ({ where: (where: SQL) => {
  const condition = new PgDialect().sqlToQuery(where); state.writes.push({ values, sql: condition.sql, params: condition.params });
  return { returning: async () => state.accepted ? [{ id: state.userId, name: values.name, phone: values.phone }] : [] };
} }) }) }) }));
import { GET, PATCH } from "@/app/api/profile/route";
import type { NextRequest } from "next/server";
const request = (body: unknown) => new Request("https://vakaygo.com/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as NextRequest;
beforeEach(() => { state.valid = true; state.accepted = true; state.dbCalls = 0; state.writes = []; });

it("rejects a visible old-account profile read before accessing the newly signed-in account", async () => {
  const result = await GET(new Request("https://vakaygo.com/api/profile?expectedUserId=other-account"));
  expect(result.status).toBe(409); expect(state.dbCalls).toBe(0);
});
it.each([undefined, "other-account"])("rejects an unpinned or old-account write before accessing profile data", async expectedUserId => {
  expect((await PATCH(request({ expectedUserId, name: "Old draft", phone: "Old phone" }))).status).toBe(409);
  expect(state.dbCalls).toBe(0); expect(state.writes).toHaveLength(0);
});
it("rejects unauthorized and malformed writes without touching profile data", async () => {
  state.valid = false; expect((await PATCH(request({ expectedUserId: state.userId, phone: "draft" }))).status).toBe(401);
  state.valid = true; expect((await PATCH(request(null))).status).toBe(400); expect(state.dbCalls).toBe(0);
});
it("updates only the pinned current account and session epoch and returns a private confirmed receipt", async () => {
  const result = await PATCH(request({ expectedUserId: state.userId, name: "  Traveler  ", phone: "  synthetic phone  " }));
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(state.writes[0].values).toMatchObject({ name: "Traveler", phone: "synthetic phone" });
  expect(state.writes[0].params).toEqual([state.userId, 3, "traveler"]);
  expect((await result.json()).user.id).toBe(state.userId);
});
it("reports a write-time identity change without returning success", async () => {
  state.accepted = false; const result = await PATCH(request({ expectedUserId: state.userId, phone: "draft" }));
  expect(result.status).toBe(409); expect((await result.json()).user).toBeUndefined();
});
