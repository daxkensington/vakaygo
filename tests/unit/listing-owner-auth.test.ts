import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const state = vi.hoisted(() => {
  const secret = "synthetic-current-session-secret-with-32-characters";
  process.env.AUTH_SECRET = secret;
  return { secret, token: "", user: { role: "operator", email: "owner@example.invalid", email_verified: true, session_version: 1 },
    matches: [] as { id: string; operatorId: string; status: string }[], selections: 0, updateAccepted: true,
    writes: [] as { values: Record<string, unknown>; sql: string; params: unknown[] }[] };
});
const revalidateListing = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/env", () => ({ env: { DATABASE_URL: "postgresql://synthetic.invalid/test" }, SESSION_SECRET: () => new TextEncoder().encode(state.secret) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/revalidate-listing", () => ({ revalidateListing }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => async () => [state.user] }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: () => { state.selections++; const query = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => state.matches, orderBy: async () => state.matches }; return query; },
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: (condition: SQL) => {
    const compiled = new PgDialect().sqlToQuery(condition); state.writes.push({ values, sql: compiled.sql, params: compiled.params });
    return Object.assign(Promise.resolve(), { returning: async () => state.updateAccepted ? [{ id: state.matches[0].id }] : [] });
  } }) }),
}) }));
import { createSessionToken } from "@/server/session-validation";
import { GET as myListings } from "@/app/api/listings/my/route";
import { PATCH as updateListing } from "@/app/api/listings/[slug]/update/route";
const listingId = "30000000-0000-4000-8000-000000000009";
const operatorId = "20000000-0000-4000-8000-000000000009";
const request = (body: unknown = {}) => new Request("https://vakaygo.com/api/listings/synthetic/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(async () => {
  state.user = { role: "operator", email: "owner@example.invalid", email_verified: true, session_version: 1 };
  state.matches = [{ id: listingId, operatorId, status: "active" }]; state.selections = 0; state.writes = []; state.updateAccepted = true;
  state.token = await createSessionToken({ id: operatorId, email: state.user.email, role: "operator", sessionVersion: 1 }); revalidateListing.mockClear();
});

it.each(["revoked epoch", "changed role", "unverified operator"])("rejects an otherwise signed token with %s before listing access or writes", async reason => {
  if (reason === "revoked epoch") state.user.session_version = 2;
  if (reason === "changed role") state.user.role = "traveler";
  if (reason === "unverified operator") state.user.email_verified = false;
  expect((await myListings()).status).toBe(401);
  expect((await updateListing(request({ title: "Changed" }), { params: Promise.resolve({ slug: listingId }) })).status).toBe(401);
  expect(state.selections).toBe(0); expect(state.writes).toHaveLength(0);
});

it("serves only current operator data with private cache policy and explicitly clears optional fields by exact ID", async () => {
  const listed = await myListings(); expect(listed.status).toBe(200); expect(listed.headers.get("cache-control")).toContain("no-store");
  const updated = await updateListing(request({ description: "", headline: "", address: "", parish: "" }), { params: Promise.resolve({ slug: listingId }) });
  expect(updated.status).toBe(200);
  expect(state.writes[0].values).toMatchObject({ description: null, headline: null, address: null, parish: null });
  expect(state.writes[0].params).toEqual([listingId, operatorId, "active", operatorId, 1, "operator"]);
  expect(state.writes[0].sql).toContain('"users"."email_verified"=true');
  expect(state.writes[0].sql).toContain('"users"."session_version"=');
  expect(revalidateListing).toHaveBeenCalledExactlyOnceWith(listingId);
});

it("rejects an owner or moderation change between initial reading and writing rather than reporting success", async () => {
  state.updateAccepted = false;
  const response = await updateListing(request({ title: "Changed" }), { params: Promise.resolve({ slug: listingId }) });
  expect(response.status).toBe(409); expect(state.writes[0].params).toContain(operatorId); expect(state.writes[0].params).toContain("active");
  expect(revalidateListing).not.toHaveBeenCalled();
});

it("rejects an ambiguous owned slug and requires the exact dashboard listing", async () => {
  state.matches.push({ id: "30000000-0000-4000-8000-000000000008", operatorId, status: "active" });
  const response = await updateListing(request({ title: "Changed" }), { params: Promise.resolve({ slug: "same-slug" }) });
  expect(response.status).toBe(409); expect(state.writes).toHaveLength(0); expect(revalidateListing).not.toHaveBeenCalled();
});
