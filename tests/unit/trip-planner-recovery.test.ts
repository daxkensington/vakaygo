// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({
  auth: vi.fn(), execute: vi.fn(), dbStarts: 0,
  search: vi.fn(), details: vi.fn(), availability: vi.fn(), error: vi.fn(),
  env: { DATABASE_URL: "postgresql://synthetic:synthetic@localhost/test", ANTHROPIC_API_KEY: "synthetic-key" as string | undefined, ANTHROPIC_CONCIERGE_MODEL: "configured-supported-model" },
}));
vi.mock("@/server/admin-auth", () => ({ requireUser: state.auth }));
vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/logger", () => ({ logger: { error: state.error } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => {
  state.dbStarts++;
  const chain = { from: () => chain, where: () => chain, limit: async () => [{ id: 1, name: "Grenada", slug: "grenada" }] };
  return { select: () => chain, execute: state.execute };
} }));
vi.mock("@/server/trip-planner-tools", () => ({ searchListings: state.search, getListingDetails: state.details, checkAvailability: state.availability }));
import { POST } from "@/app/api/trips/generate/route";
import { GET as listTrips, POST as createTrip } from "@/app/api/trips/route";
import { GET as readTrip, PATCH as editTrip, DELETE as deleteTrip } from "@/app/api/trips/[id]/route";
const userId = "10000000-0000-4000-8000-000000000002", listingId = "20000000-0000-4000-8000-000000000001";
const body = { islandId: 1, startDate: "2027-01-01", endDate: "2027-01-02", interests: ["Beach"] };
const request = (value: unknown = body, signal?: AbortSignal) => new Request("https://vakaygo.com/api/trips/generate", { method: "POST", body: JSON.stringify(value), signal });
const listing = { id: listingId, title: "Catalog tour", slug: "catalog-tour", type: "tour", headline: null, priceAmount: null, priceCurrency: "USD", priceUnit: null, avgRating: "4.5", reviewCount: 1, parish: null, islandSlug: "grenada", islandName: "Grenada", image: "https://images.example.invalid/catalog.png", bookingEligible: false };
const itinerary = () => ({ title: "A day in Grenada", summary: "A suggested day.", estimatedBudget: { accommodation: 0, activities: 0, dining: 0, transport: 0, total: 0 }, days: [{ dayNumber: 1, date: body.startDate, theme: "Beach", items: [{ timeSlot: "morning", type: "tour", title: "Morning tour", listingId, listingSlug: "model-made-up-link", listingTitle: "Model name", price: 999, rating: 1, image: "https://wrong.example.invalid/photo.png", note: "Contact the business for details." }] }] });
const provider = (plan: unknown = itinerary()) => vi.fn()
  .mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", id: "search1", name: "search_listings", input: { island: "grenada", type: "tour" } }], stop_reason: "tool_use" }))
  .mockResolvedValueOnce(Response.json({ content: [{ type: "text", text: JSON.stringify(plan) }], stop_reason: "end_turn" }));
beforeEach(() => {
  vi.clearAllMocks(); state.dbStarts = 0;
  state.env.ANTHROPIC_API_KEY = "synthetic-key";
  state.auth.mockResolvedValue({ ok: true, userId, role: "traveler", sessionVersion: 4, emailVerified: true });
  state.execute.mockResolvedValue({ rows: [{ id: "30000000-0000-4000-8000-000000000001", title: "A day in Grenada" }] });
  state.search.mockResolvedValue([listing]); state.details.mockResolvedValue(listing);
});
afterEach(() => vi.unstubAllGlobals());
it("uses the configured model and one cancellation deadline across provider turns, saves atomically and keeps catalog facts", async () => {
  const fetch = provider(); vi.stubGlobal("fetch", fetch);
  const response = await POST(request()); expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.itinerary.days[0].items[0]).toMatchObject({ listingSlug: listing.slug, listingTitle: listing.title, image: listing.image, rating: 4.5, price: null });
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).model).toBe("configured-supported-model");
  expect(fetch.mock.calls[0][1].signal).toBe(fetch.mock.calls[1][1].signal);
  expect(state.execute).toHaveBeenCalledTimes(1);
  const query = new PgDialect().sqlToQuery(state.execute.mock.calls[0][0]);
  expect(query.sql).toContain("INSERT INTO trips"); expect(query.sql).toContain("INSERT INTO trip_items");
  expect(query.sql).toContain("session_version="); expect(query.sql).toContain("FOR SHARE");
  expect(query.params.slice(0, 4)).toEqual([userId, 4, "traveler", true]);
});
it.each([null, { ...body, startDate: "2027-02-30" }, { ...body, endDate: body.startDate }, { ...body, endDate: "2027-02-15" }, { ...body, interests: [42] }, { ...body, specialRequests: "x".repeat(2001) }])("rejects invalid inputs before database or provider work: %j", async value => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await POST(request(value))).status).toBe(400); expect(state.dbStarts).toBe(0); expect(fetch).not.toHaveBeenCalled();
});
it("treats malformed JSON as a correctable request error", async () => {
  expect((await POST(new Request("https://vakaygo.com/api/trips/generate", { method: "POST", body: "{" }))).status).toBe(400);
  expect(state.dbStarts).toBe(0);
});
it("returns recovery before database access when the AI credential is missing", async () => {
  state.env.ANTHROPIC_API_KEY = undefined; const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await POST(request()); expect(response.status).toBe(503); expect((await response.json()).code).toBe("TRIP_PLANNER_UNAVAILABLE");
  expect(state.dbStarts).toBe(0); expect(fetch).not.toHaveBeenCalled();
});
it("does not expose or log raw provider failures", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "private-provider-detail" } }, { status: 401 })));
  const response = await POST(request()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private-provider-detail");
  expect(state.execute).not.toHaveBeenCalled(); expect(state.error).toHaveBeenCalledWith("Trip planner provider request failed", null, { status: 401 });
});
it.each(["invented listing", "wrong day", "invalid output"])("does not save %s", async kind => {
  const plan = itinerary();
  if (kind === "invented listing") plan.days[0].items[0].listingId = "20000000-0000-4000-8000-000000000099";
  if (kind === "wrong day") plan.days[0].date = "2027-01-03";
  vi.stubGlobal("fetch", provider(kind === "invalid output" ? {} : plan));
  expect((await POST(request())).status).toBe(503); expect(state.execute).not.toHaveBeenCalled();
});
it("reports an account change instead of claiming that a rejected write saved", async () => {
  vi.stubGlobal("fetch", provider()); state.execute.mockResolvedValue({ rows: [] });
  expect((await POST(request())).status).toBe(409);
});
it("cancels the provider on disconnect and does not save a partial trip", async () => {
  const caller = new AbortController(); let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true }); started();
  })));
  const pending = POST(request(body, caller.signal)); await ready; caller.abort();
  expect((await pending).status).toBe(503); expect(state.execute).not.toHaveBeenCalled();
});
it("stops the tool loop immediately when a caller disconnects during catalog work", async () => {
  const caller = new AbortController();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ content: [
    { type: "tool_use", id: "search", name: "search_listings", input: { island: "grenada" } },
    { type: "tool_use", id: "details", name: "get_listing_details", input: { listingId } },
  ], stop_reason: "tool_use" })));
  state.search.mockImplementation(async () => { caller.abort(); return [listing]; });
  expect((await POST(request(body, caller.signal))).status).toBe(503);
  expect(state.details).not.toHaveBeenCalled(); expect(state.execute).not.toHaveBeenCalled();
});
it("rejects revoked sessions on all trip read/write routes before database or AI work", async () => {
  state.auth.mockResolvedValue({ ok: false, error: Response.json({ error: "Unauthorized" }, { status: 401 }) });
  const params = { params: Promise.resolve({ id: "30000000-0000-4000-8000-000000000001" }) };
  const responses = await Promise.all([POST(request()), listTrips(), createTrip(request()), readTrip(request(), params), editTrip(request(), params), deleteTrip(request(), params)]);
  expect(responses.map(r => r.status)).toEqual([401, 401, 401, 401, 401, 401]); expect(state.dbStarts).toBe(0);
});
it("requires an actual successful catalogue lookup even for a model plan containing only personal time", async () => {
  const plan = itinerary(); Object.assign(plan.days[0].items[0], { type: "free", listingId: null, title: "Fort George is completely free and open now", note: "Just show up." });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ content: [{ type: "text", text: JSON.stringify(plan) }], stop_reason: "end_turn" })));
  expect((await POST(request())).status).toBe(503); expect(state.execute).not.toHaveBeenCalled();
});
it("saves only deterministic planning text after an empty successful catalogue search, discarding named free/open claims and estimated costs", async () => {
  const plan = itinerary(); const invented = "Fort George is completely free and open now. No reservation needed. Just show up.";
  plan.title = invented; plan.summary = invented; plan.days[0].theme = invented;
  Object.assign(plan.days[0].items[0], { type: "free", listingId: null, title: invented, note: invented });
  state.search.mockResolvedValue([]); vi.stubGlobal("fetch", provider(plan));
  const response = await POST(request()); expect(response.status).toBe(200); const result = await response.json();
  expect(JSON.stringify(result.itinerary)).not.toContain(invented); expect(result.itinerary).not.toHaveProperty("estimatedBudget");
  expect(result.itinerary.days[0].items[0]).toMatchObject({ title: "Personal time", price: null, listingId: null });
  const query = new PgDialect().sqlToQuery(state.execute.mock.calls[0][0]);
  expect(JSON.stringify(query.params)).not.toContain(invented); expect(JSON.stringify(query.params)).toContain("Planning slots are suggestions only");
  const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
  expect(sent.system).toContain("Missing/null/zero platform prices"); expect(sent.system).toContain("Planning slots");
});