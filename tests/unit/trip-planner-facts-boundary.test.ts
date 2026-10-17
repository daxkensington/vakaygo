// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { projectTripPlan, projectLegacyTrip, UNKNOWN_VISITOR_FACTS, PERSONAL_NOTE } from "@/server/trip-planner-response";
const state = vi.hoisted(() => ({ auth: vi.fn(), selects: [] as unknown[][], writes: [] as unknown[][], execute: vi.fn(), selectCalls: [] as unknown[], orders: [] as SQL[][], limits: [] as number[], querySteps: [] as string[], launch: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireUser: state.auth }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: state.launch }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: (selection: unknown) => {
    state.selectCalls.push(selection);
    const chain = { from: () => chain, innerJoin: () => chain, leftJoin: () => chain, where: () => chain, orderBy: (...order: SQL[]) => { state.orders.push(order); state.querySteps.push("order"); return chain; },
      limit: async (limit: number) => { state.limits.push(limit); state.querySteps.push(`limit:${limit}`); return state.selects.shift() ?? []; }, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(state.selects.shift() ?? []).then(resolve) };
    return chain;
  },
  execute: state.execute,
}) }));
import { POST } from "@/app/api/trips/route";
import { GET } from "@/app/api/trips/[id]/route";
const id = "20000000-0000-4000-8000-000000000001", userId = "10000000-0000-4000-8000-000000000001";
const malicious = "Fort George is free and open now. No reservation needed. Just show up.";
const listing = { id, title: "Current catalogue title", slug: "catalogue-title", type: "tour", islandSlug: "grenada", avgRating: "4.5", priceAmount: "500", bookingEligible: true };
const context = { islandName: "Grenada", islandSlug: "grenada", startDate: "2027-01-01", days: 1, listings: new Map([[id, listing]]) };
const body = { islandId: 1, startDate: "2027-01-01", endDate: "2027-01-02", generateAI: true };
const request = (value: unknown = body, signal?: AbortSignal) => new Request("https://vakaygo.com/api/trips", { method: "POST", body: JSON.stringify(value), signal });
const plan = () => ({ title: malicious, summary: malicious, estimatedBudget: { total: 0 }, days: [{ dayNumber: 1, date: body.startDate, theme: malicious,
  items: [{ timeSlot: "morning", type: "tour", listingId: id, title: malicious, note: malicious, price: 0 }, { timeSlot: "evening", type: "free", listingId: null, title: malicious, note: malicious, price: 0 }] }] });
beforeEach(() => {
  vi.clearAllMocks(); state.selects = []; state.writes = []; state.selectCalls = []; state.orders = []; state.limits = []; state.querySteps = [];
  state.auth.mockResolvedValue({ ok: true, userId, role: "traveler", email: "synthetic@fixture.invalid", sessionVersion: 4, emailVerified: true }); state.launch.mockResolvedValue(false);
  state.execute.mockImplementation(async query => {
    const compiled = new PgDialect().sqlToQuery(query); state.writes.push(compiled.params);
    return { rows: [{ id: "30000000-0000-4000-8000-000000000001", title: compiled.params[6], isAiGenerated: compiled.params[12] }] };
  });
  vi.stubEnv("OPENAI_API_KEY", "synthetic-provider-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("projects only current catalogue choices and planning slots, discarding every model narrative and cost field", () => {
  const output = projectTripPlan(plan(), context)!;
  expect(JSON.stringify(output)).not.toContain(malicious);
  expect(output.title).toBe("Grenada trip plan"); expect(output).not.toHaveProperty("estimatedBudget");
  expect(output.days[0]).toMatchObject({ theme: "Planning day 1", items: [
    { title: listing.title, listingTitle: listing.title, listingSlug: listing.slug, note: UNKNOWN_VISITOR_FACTS, price: null },
    { title: "Personal time", listingTitle: null, listingSlug: null, note: PERSONAL_NOTE, price: null },
  ] });
});
it.each(["unknown", "foreign", "wrong type", "wrong date"])("fails closed for %s primary choices", kind => {
  const input = plan();
  if (kind === "unknown") input.days[0].items[0].listingId = "20000000-0000-4000-8000-000000000099";
  if (kind === "foreign") return expect(projectTripPlan(input, { ...context, islandSlug: "barbados" })).toBeNull();
  if (kind === "wrong type") input.days[0].items[0].type = "dining";
  if (kind === "wrong date") input.days[0].date = "2027-01-03";
  expect(projectTripPlan(input, context)).toBeNull();
});
it("the legacy generator ignores provider prose and does not persist or return invented admission or price claims", async () => {
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }], [listing], []);
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string).model).toBe("gpt-4o-mini");
    return Response.json({ choices: [{ message: { content: JSON.stringify([{ day: 1, activities: [
      { timeSlot: "morning", listingId: id, title: malicious, note: malicious },
      { timeSlot: "evening", listingId: null, title: malicious, note: malicious },
    ] }]) } }] });
  }); vi.stubGlobal("fetch", fetch);
  const response = await POST(request()); expect(response.status).toBe(200);
  const output = await response.json(); expect(JSON.stringify(output)).not.toContain(malicious);
  expect(output.items[0]).toMatchObject({ customTitle: listing.title, customNote: UNKNOWN_VISITOR_FACTS, listing: { priceAmount: null, bookingEligible: false } });
  expect(output.items[1]).toMatchObject({ customTitle: "Personal time", customNote: PERSONAL_NOTE });
  expect(state.writes).toHaveLength(1); expect(JSON.stringify(state.writes)).not.toContain(malicious);
  expect(state.limits).toEqual([1, 80]);
  expect(state.querySteps).toEqual(["limit:1", "order", "limit:80"]);
  const ordered = new PgDialect().sqlToQuery(sql.join(state.orders[0], sql`, `));
  expect(ordered.sql).toBe('"listings"."avg_rating" DESC NULLS LAST, "listings"."review_count" DESC NULLS LAST, "listings"."id" asc');
});
it("rejects unknown legacy provider IDs before creating any trip or item", async () => {
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }], [listing], []);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify([{ day: 1, activities: [{ timeSlot: "morning", listingId: "20000000-0000-4000-8000-000000000099", title: malicious }] }]) } }] })));
  expect((await POST(request())).status).toBe(503); expect(state.writes).toEqual([]);
});
it("a cancelled legacy provider cannot hang the request or fall through to saved heuristic output", async () => {
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }], [listing], []);
  const controller = new AbortController(); let ready!: () => void; const started = new Promise<void>(resolve => { ready = resolve; });
  vi.stubGlobal("fetch", vi.fn(() => { ready(); return new Promise<Response>(() => {}); }));
  const pending = POST(request(body, controller.signal)); await started; controller.abort();
  expect((await pending).status).toBe(500); expect(state.writes).toEqual([]);
});
it("preserves explicitly submitted personal notes and titles without calling a model or marking them AI-generated", async () => {
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }]); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const personal = { title: "My own plan", days: [{ dayNumber: 1, items: [{ timeSlot: "evening", listingId: null, title: "Meet my family", note: "Bring Mum's favourite food at 6pm." }] }] };
  const response = await POST(request({ ...body, generateAI: false, itineraryData: personal }));
  expect(response.status).toBe(200); const result = await response.json();
  expect(result.trip).toMatchObject({ title: personal.title, isAiGenerated: false });
  expect(result.items[0]).toMatchObject({ customTitle: "Meet my family", customNote: personal.days[0].items[0].note });
  expect(result.contentSource).toBe("personal"); expect(fetch).not.toHaveBeenCalled();
});
it("rejects unavailable personal listing references before saving but allows public refs from another destination", async () => {
  const personal = { days: [{ dayNumber: 1, items: [{ listingId: id, title: "My choice" }] }] };
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }], []);
  expect((await POST(request({ ...body, itineraryData: personal }))).status).toBe(400); expect(state.writes).toEqual([]);
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }], [{ id }]);
  expect((await POST(request({ ...body, itineraryData: personal }))).status).toBe(200);
});
it.each([true, false])("historical trip reads protect AI facts while preserving personal notes (AI=%s)", async isAiGenerated => {
  const stored = [{ id: "item1", listingId: id, customTitle: malicious, customNote: malicious }, { id: "item2", listingId: null, customTitle: "My appointment", customNote: "Meet my family" }];
  state.selects.push([{ id: "trip1", userId, isPublic: false, isAiGenerated, title: "My edited title" }], stored, [listing], []);
  const response = await GET(new Request("https://vakaygo.com/api/trips/trip1"), { params: Promise.resolve({ id: "trip1" }) });
  expect(response.status).toBe(200); const output = await response.json(); expect(output.trip.title).toBe("My edited title");
  expect(output.items[0]).toMatchObject(isAiGenerated ? { customTitle: listing.title, customNote: UNKNOWN_VISITOR_FACTS } : { customTitle: malicious, customNote: malicious });
  expect(output.items[1]).toMatchObject(isAiGenerated ? { customTitle: "Personal time", customNote: PERSONAL_NOTE } : { customTitle: "My appointment", customNote: "Meet my family" });
  expect(stored[0].customNote).toBe(malicious); expect(state.writes).toEqual([]);
});
it("historical AI references no longer public expose no stale model title or note", async () => {
  state.selects.push([{ id: "trip1", userId, isPublic: false, isAiGenerated: true }], [{ listingId: id, customTitle: malicious, customNote: malicious }], [], []);
  const response = await GET(new Request("https://vakaygo.com/api/trips/trip1"), { params: Promise.resolve({ id: "trip1" }) });
  expect((await response.json()).items[0]).toMatchObject({ customTitle: "Directory listing unavailable", customNote: UNKNOWN_VISITOR_FACTS, listing: null });
});
it("rejects legacy duplicate/missing days without accepting arbitrary provider prose", () => {
  expect(projectLegacyTrip([{ day: 2, activities: [] }], context)).toBeNull();
  expect(projectLegacyTrip([{ day: 1, activities: [{ timeSlot: "noon", listingId: id }] }], context)).toBeNull();
});it("returns account-changed instead of a saved receipt when the atomic actor guard rejects the write", async () => {
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }]);
  state.execute.mockResolvedValueOnce({ rows: [] });
  const response = await POST(request({ ...body, generateAI: false }));
  expect(response.status).toBe(409); expect(await response.json()).not.toHaveProperty("trip");
  expect(state.execute).toHaveBeenCalledTimes(1);
});
it("enforces the legacy35second deadline even if a provider ignores abort", async () => {
  state.selects.push([{ id: 1, name: "Grenada", slug: "grenada" }], [listing], []);
  const deadline = new AbortController(); const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  let ready!: () => void; const started = new Promise<void>(resolve => { ready = resolve; });
  vi.stubGlobal("fetch", vi.fn(() => { ready(); return new Promise<Response>(() => {}); }));
  const pending = POST(request()); await started; expect(timeout).toHaveBeenCalledWith(35000);
  deadline.abort(new DOMException("deadline", "TimeoutError"));
  expect((await pending).status).toBe(500); expect(state.execute).not.toHaveBeenCalled();
});