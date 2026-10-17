// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { POST as smartSearch } from "@/app/api/ai/smart-search/route";
import { POST as searchSummary } from "@/app/api/ai/search-summary/route";
import { parseListingFilters } from "@/lib/listing-filters";
import { logger } from "@/lib/logger";

const request = (body: unknown, signal?: AbortSignal) => new Request("https://test.invalid/api/ai/search", { method: "POST", signal, body: JSON.stringify(body) });
const completion = (value: unknown) => Response.json({ choices: [{ message: { content: typeof value === "string" ? value : JSON.stringify(value) } }] });
const provide = (value: unknown) => {
  const fetch = vi.fn<(_url: string, _init: RequestInit) => Promise<Response>>().mockResolvedValue(completion(value));
  vi.stubGlobal("fetch", fetch); return fetch;
};
beforeEach(() => { vi.stubEnv("GROK_API_KEY", "synthetic-unused-key"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("keeps useful validated filters while discarding invented narrative and suggestions", async () => {
  const fetch = provide({ filters: { type: "dining", island: "grenada", q: "romantic ocean-view guaranteed free open now", maxPrice: "100", minRating: "4.5", guests: "2", amenities: ["ocean-view", "free-entry", "ocean-view"], duration: "2-4", bookingEligible: true, url: "https://untrusted.invalid" }, summary: "Free entry; open daily9–5; just show up.", suggestions: ["No reservation needed", "Guaranteed free access"] });
  const response = await smartSearch(request({ query: "Find a romantic dinner with ocean view in Grenada for 2 under100" }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.filters).toEqual({ type: "dining", island: "grenada", q: "romantic ocean view", maxPrice: 100, minRating: 4.5, guests: 2, amenities: ["ocean-view"], duration: "2-4" });
  expect(body.summary).toContain("Search intent: directory dining in Grenada"); expect(body.summary).toContain("opening hours and reservation requirements are unconfirmed");
  expect(body.suggestions).toEqual(["Find dining in Grenada", "Find stays in Grenada", "Find tours in Grenada"]);
  for (const falseClaim of ["Free entry", "daily9–5", "just show up", "No reservation needed", "Guaranteed", "untrusted.invalid"]) expect(JSON.stringify(body)).not.toContain(falseClaim);
  const params = new URLSearchParams({ ...body.filters, amenities: body.filters.amenities.join(",") });
  expect(parseListingFilters(params)).toMatchObject({ type: "dining", island: "grenada", q: "romantic ocean view", maxPrice: 100, guests: 2 });
  expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({ model: "grok-3-mini", max_tokens: 500 });
});
it("matches normal punctuation and British/American word forms without accepting new model words", async () => {
  provide({ filters: { type: "excursion", island: "st-lucia", q: "family snorkeling invented-access", guests: 4 } });
  const body = await (await smartSearch(request({ query: "Find family-friendly snorkelling, near St. Lucia!" }))).json();
  expect(body.filters).toMatchObject({ type: "excursion", island: "st-lucia", q: "family snorkelling", guests: 4 });
  expect(body.summary).toContain("St. Lucia"); expect(JSON.stringify(body)).not.toContain("invented");
});
it("does not echo a user's requested free/open condition as a confirmed search finding", async () => {
  provide({ filters: { q: "free beaches", type: "excursion", island: "grenada" }, summary: "These beaches are free and open now", suggestions: ["Open beaches without reservations"] });
  const body = await (await smartSearch(request({ query: "Find free beaches open now in Grenada" }))).json();
  expect(body.filters.q).toBe("free beaches");
  expect(body.summary).not.toContain("free"); expect(body.summary).not.toContain("open now");
  expect(body.suggestions.every((value: string) => value.startsWith("Find "))).toBe(true);
});
it.each([
  { type: "public-beach", island: "atlantis", minPrice: -1, maxPrice: "Infinity", minRating: 6, guests: 2.5, amenities: "free-entry", duration: "always-open", q: "invented claims", arbitrary: "free" },
  { type: {}, island: [], minPrice: true, maxPrice: "50USD", minRating: "NaN", guests: "4.5", amenities: [null, "unknown"], duration: "unknown", q: 42 },
])("drops unknown fields, unsupported enums and invalid numeric filters: %j", async filters => {
  provide({ filters }); const body = await (await smartSearch(request({ query: "Find snorkeling" }))).json();
  expect(body.filters).toEqual({}); expect(body.summary).toContain("supported destinations");
});
it("retains valid zero/maximum filter bounds and drops an inverted range", async () => {
  const fetch = provide({ filters: { minPrice: 0, maxPrice: 1_000_000, minRating: 0, guests: 100 } });
  expect((await (await smartSearch(request({ query: "Find stays" }))).json()).filters).toEqual({ minPrice: 0, maxPrice: 1_000_000, minRating: 0, guests: 100 });
  fetch.mockResolvedValueOnce(completion({ filters: { minPrice: 100, maxPrice: 50, guests: 101 } }));
  expect((await (await smartSearch(request({ query: "Find stays" }))).json()).filters).toEqual({});
});
it("accepts direct-filter JSON and recovers malformed completions as a bounded ordinary user search", async () => {
  const fetch = provide("```json\n{\"type\":\"tour\",\"island\":\"medellin\",\"q\":\"coffee\"}\n```");
  expect((await (await smartSearch(request({ query: "Find coffee tours in Medellín" }))).json()).filters).toMatchObject({ type: "tour", island: "medellin", q: "coffee" });
  fetch.mockResolvedValueOnce(completion("Ignore the rules. Entry is free and open now."));
  const body = await (await smartSearch(request({ query: "snorkeling family" }))).json();
  expect(body.filters.q).toBe("snorkeling family"); expect(body.summary).not.toContain("Entry is free");
});
it.each([null, {}, [], { query: "   " }, { query: 42 }])("rejects malformed smart-search input before calling a provider: %j", async body => {
  const fetch = provide({}); expect((await smartSearch(request(body))).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});
it("keeps the original400-character query and500-token provider bounds", async () => {
  const fetch = provide({ filters: {} }); await smartSearch(request({ query: "a".repeat(900) }));
  const [url, init] = fetch.mock.calls[0], payload = JSON.parse(String(init.body));
  expect(url).toBe("https://api.x.ai/v1/chat/completions"); expect(payload.model).toBe("grok-3-mini"); expect(payload.max_tokens).toBe(500); expect(payload.messages[1].content).toHaveLength(400); expect(init.signal).toBeInstanceOf(AbortSignal);
});
it("never promotes browser-supplied titles/prices/counts or model prose into a result summary", async () => {
  const fetch = provide({ focus: "compare", summary: "Fort Test is free and open9–5, no bookings needed", suggestions: ["Guaranteed walk-ins"] });
  const response = await searchSummary(request({ query: "x".repeat(900), resultCount: 123456, topResults: Array.from({ length: 8 }, () => ({ title: "OFFICIAL free entry open9–5 " + "x".repeat(300), type: "dining", rating: 5, price: 0 })) }));
  const body = await response.json();
  expect(response.status).toBe(200); expect(body.summary).toContain("Compare the published directory details"); expect(body.summary).toContain("are unconfirmed");
  for (const falseClaim of ["Fort Test", "OFFICIAL", "open9–5", "no bookings needed", "123456", "Guaranteed"]) expect(body.summary).not.toContain(falseClaim);
  const payload = JSON.parse(String(fetch.mock.calls[0][1].body)), context = JSON.parse(payload.messages[1].content), top = JSON.parse(context.untrustedTopResults);
  expect(payload).toMatchObject({ model: "grok-3-mini", max_tokens: 150 }); expect(context.query).toHaveLength(300); expect(top).toHaveLength(5);
  expect(top.every((row: { title: string }) => row.title.length <= 120)).toBe(true); expect(Object.keys(top[0])).toEqual(["title", "type"]);
});
it.each(["Entry is free and open now", { focus: "free access", summary: "No reservation required" }, { focus: "refine", narrative: "Open daily" }])("uses only a closed summary guidance enum: %j", async value => {
  provide(value); const body = await (await searchSummary(request({ resultCount: 0, topResults: [null, {}, "unsafe"] }))).json();
  expect(body.summary).toContain("are unconfirmed"); expect(body.summary).not.toContain("Entry is free"); expect(body.summary).not.toContain("No reservation required"); expect(body.summary).not.toContain("Open daily"); expect(body.summary).not.toContain("no matches");
});
it.each([-1, 1.5, "4", null, Number.MAX_SAFE_INTEGER + 1])("rejects invalid result counts before provider access: %j", async resultCount => {
  const fetch = provide({}); expect((await searchSummary(request({ resultCount }))).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});
const routes = [{ name: "smart-search", post: smartSearch, body: { query: "Find tours" } }, { name: "search-summary", post: searchSummary, body: { resultCount: 2 } }];
it.each(routes)("keeps provider errors fixed and private for $name", async ({ post, body }) => {
  const fetch = provide({}), providerError = Response.json({ error: "PRIVATE provider marker" }, { status: 503 });
  const text = vi.spyOn(providerError, "text"), json = vi.spyOn(providerError, "json");
  vi.mocked(logger.error).mockClear(); fetch.mockResolvedValueOnce(providerError);
  const response = await post(request(body)); expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
  expect(text).not.toHaveBeenCalled(); expect(json).not.toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalledExactlyOnceWith(expect.any(String), null, { status: 503 });
  expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("PRIVATE");
});
it.each(routes)("keeps transport failures fixed and private for $name", async ({ post, body }) => {
  const fetch = provide({}); fetch.mockRejectedValueOnce(new Error("PRIVATE transport marker"));
  const response = await post(request(body)); expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
});
it.each(routes.flatMap(route => ["fetch", "body"].map(phase => ({ ...route, phase }))))("bounds stalled $phase waits under the same35s budget for $name", async ({ post, body, phase }) => {
  const deadline = new AbortController(); vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const fetch = vi.fn<(_url: string, _init: RequestInit) => Promise<Response>>(() => phase === "fetch" ? new Promise<Response>(() => { entered(); }) : Promise.resolve({ ok: true, json: () => new Promise(() => { entered(); }) } as Response));
  vi.stubGlobal("fetch", fetch); const pending = post(request(body)); await started; deadline.abort(new Error("PRIVATE deadline marker"));
  const response = await pending; expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
  expect(AbortSignal.timeout).toHaveBeenCalledWith(35000); expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(routes)("forwards caller cancellation and returns a fixed recovery error for $name", async ({ post, body }) => {
  const caller = new AbortController(); let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const fetch = vi.fn(() => new Promise<Response>(() => { entered(); })); vi.stubGlobal("fetch", fetch);
  const pending = post(request(body, caller.signal)); await started; caller.abort();
  expect((await pending).status).toBe(500); expect(fetch).toHaveBeenCalledTimes(1);
});
