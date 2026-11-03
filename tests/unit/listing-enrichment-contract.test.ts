// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ execute: vi.fn(), fetch: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ execute: state.execute }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
import { GET } from "@/app/api/cron/enrich-listings/route";
const request = () => new Request("http://localhost/api/cron/enrich-listings", { headers: { authorization: "Bearer fixture-cron" } });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "fixture-cron"); vi.stubEnv("GOOGLE_PLACES_API_KEY", "fixture-key"); vi.stubGlobal("fetch", state.fetch); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("fails closed before querying or calling a provider when cron authentication is unconfigured", async () => {
 vi.stubEnv("CRON_SECRET", ""); expect((await GET(request())).status).toBe(401); expect(state.execute).not.toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled();
});
it("enriches a null description and accepts only correctly typed provider contact and hours fields", async () => {
 const description = "An accurate, detailed supplier description with enough content.";
 state.execute.mockResolvedValueOnce({ rows: [{ id: "a", title: "A tour", type: "tour", description: null, priceAmount: null, typeData: { googlePlaceId: "place-a", existing: "retained" } }] }).mockResolvedValue({ rows: [] });
 state.fetch.mockResolvedValue(Response.json({ status: "OK", result: { website: { invalid: true }, formatted_phone_number: 123, opening_hours: { weekday_text: ["Monday", 2] }, editorial_summary: { overview: description } } }));
 const response = await GET(request()); expect(await response.json()).toMatchObject({ ok: true, enriched: 1 });
 const query = new PgDialect().sqlToQuery(state.execute.mock.calls[1][0]); expect(query.params).toContain(description);
 const data = query.params.find(value => typeof value === "string" && value.startsWith("{"));
 expect(JSON.parse(String(data))).toEqual({ googlePlaceId: "place-a", existing: "retained" });
});
it("skips malformed imported place identifiers before calling Google or updating a listing", async () => {
 state.execute.mockResolvedValue({ rows: [{ id: "a", title: "A tour", type: "tour", description: null, priceAmount: null, typeData: { googlePlaceId: { invalid: true } } }] });
 expect(await (await GET(request())).json()).toMatchObject({ ok: true, enriched: 0 }); expect(state.fetch).not.toHaveBeenCalled(); expect(state.execute).toHaveBeenCalledTimes(1);
});
