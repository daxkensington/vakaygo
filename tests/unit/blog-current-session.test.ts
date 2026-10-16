// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SessionPayload } from "@/server/session-validation";
const state = vi.hoisted(() => ({ verify: vi.fn(), admin: vi.fn(), predicates: [] as SQL[], writes: 0, post: null as Record<string, unknown> | null }));
vi.mock("@/server/admin-auth", () => ({ verifySession: state.verify, requireAdmin: state.admin }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ select: (selection: Record<string, unknown>) => new Query(selection), insert: () => { state.writes++; throw new Error("unexpected write"); }, update: () => { state.writes++; throw new Error("unexpected write"); }, delete: () => { state.writes++; throw new Error("unexpected write"); } }) }));
import { POST } from "@/app/api/blog/route";
import { GET, PUT, DELETE } from "@/app/api/blog/[slug]/route";
class Query {
  constructor(private selection: Record<string, unknown>) {}
  orderBy() { return this; } limit() { return this; }
  from() { return this; } innerJoin() { return this; } leftJoin() { return this; }
  where(predicate: SQL) { state.predicates.push(predicate); return this; }
  then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve("content" in this.selection && state.post ? [state.post] : []).then(resolve); }
}
const params = { params: Promise.resolve({ slug: "draft.png" }) };
const request = () => new NextRequest("http://localhost/api/blog/draft.png", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
beforeEach(() => { vi.clearAllMocks(); state.predicates = []; state.writes = 0; state.post = null; state.verify.mockResolvedValue(null); state.admin.mockResolvedValue({ ok: false, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }); });
it("limits a revoked or absent canonical session to published posts, even for image-like slugs", async () => {
  expect((await GET(request(), params)).status).toBe(404);
  expect(state.verify).toHaveBeenCalledOnce();
  const query = new PgDialect().sqlToQuery(state.predicates[0]);
  expect(query.params).toContain("published");
});
const actor: SessionPayload = { userId: "current-admin", role: "admin", email: "admin@example.invalid", emailVerified: true, sessionVersion: 2 };
const draft = { id: "draft-a", slug: "draft.png", content: "Unpublished copy", category: "travel", status: "draft" };
it("allows a current admin session to resolve draft metadata without caching it", async () => {
  state.verify.mockResolvedValue(actor); state.post = draft;
  const response = await GET(request(), params);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ post: draft });
  expect(state.verify).toHaveBeenCalledTimes(2);
  expect(new PgDialect().sqlToQuery(state.predicates[0]).params).not.toContain("published");
});
it.each([401, 403])("blocks every blog write before database access for a rejected current administrator (%i)", async status => {
  state.admin.mockResolvedValue({ ok: false, error: NextResponse.json({ error: "Denied" }, { status }) });
  expect((await POST(request())).status).toBe(status);
  expect((await PUT(request(), params)).status).toBe(status);
  expect((await DELETE(request(), params)).status).toBe(status);
  expect(state.admin).toHaveBeenCalledTimes(3);
  expect(state.writes).toBe(0); expect(state.predicates).toEqual([]);
});

it.each([null, { ...actor, role: "traveler" }, { ...actor, sessionVersion: 3 }, { ...actor, email: "changed@example.invalid" }])("discards draft data when the current identity changes during the read (%j)", async current => {
  state.post = draft; state.verify.mockResolvedValueOnce(actor).mockResolvedValueOnce(current);
  const response = await GET(request(), params);
  expect(response.status).toBe(401); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).not.toHaveProperty("post");
});
