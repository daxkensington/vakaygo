import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ auth: vi.fn(), responses: [] as unknown[][], queries: [] as unknown[], starts: 0 }));
vi.mock("@/server/business-onboarding", () => ({ requireCurrentOperator: state.auth, assertListingId: (value: string) => { if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Invalid listing ID"); }, onboardingErrorResponse: () => new Response(null, { status: 400 }) }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ select: () => { state.starts++; const chain = { from: () => chain, innerJoin: () => chain, where: (condition: unknown) => { state.queries.push(condition); return chain; }, limit: async () => state.responses.shift() || [], orderBy: async () => state.responses.shift() || [] }; return chain; } }) }));
vi.mock("@/lib/image-utils", () => ({ getImageUrl: (url: string) => `/api/image?url=${encodeURIComponent(url)}` }));
import { GET } from "@/app/api/operator/listings/[listingId]/route";
const listingId = "20000000-0000-4000-8000-000000000001", ownerId = "10000000-0000-4000-8000-000000000001";
const request = (id = listingId) => GET(new Request("https://vakaygo.com/api/operator/listings/" + id), { params: Promise.resolve({ listingId: id }) });
const compile = (condition: unknown) => new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
beforeEach(() => { state.auth.mockReset().mockResolvedValue({ ok: true, userId: ownerId }); state.responses = []; state.queries = []; state.starts = 0; });
it("rejects a revoked or ineligible session before reading private drafts", async () => {
  state.auth.mockResolvedValue({ ok: false, error: new Response(null, { status: 401 }) }); expect((await request()).status).toBe(401); expect(state.starts).toBe(0);
});
it("reads a current owner's unpublished UUID listing and original editable price privately", async () => {
  state.responses = [[{ id: listingId, title: "Private draft", status: "draft", priceAmount: "42.50" }], [{ id: "media", url: "https://images.example.invalid/synthetic.png", alt: "Synthetic" }]];
  const result = await request(); expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await result.json()).toMatchObject({ listing: { id: listingId, status: "draft", priceAmount: "42.50", images: [{ url: "/api/image?url=https%3A%2F%2Fimages.example.invalid%2Fsynthetic.png" }] } });
  expect(compile(state.queries[0]).params).toEqual([listingId, ownerId]); expect(compile(state.queries[0]).sql).not.toContain('"status"'); expect(compile(state.queries[1]).params).toEqual([listingId]);
});
it("does not expose private images for an absent or non-owned UUID", async () => {
  state.responses = [[], [{ id: "private-image" }]]; expect((await request()).status).toBe(404); expect(state.starts).toBe(1); expect(compile(state.queries[0]).params).toEqual([listingId, ownerId]);
});
it("rejects slug input on the private UUID endpoint before database reads", async () => { expect((await request("synthetic-public-slug")).status).toBe(400); expect(state.starts).toBe(0); });
