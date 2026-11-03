// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ search: vi.fn(), details: vi.fn(), availability: vi.fn(), island: vi.fn(), compare: vi.fn(), actor: vi.fn(), execute: vi.fn(), send: vi.fn(), booking: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { ANTHROPIC_API_KEY: "synthetic-unused-key", ANTHROPIC_CONCIERGE_MODEL: "synthetic-model" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/server/admin-auth", () => ({ verifySession: state.actor }));
vi.mock("@/server/db", () => ({ createDb: () => ({ execute: state.execute }) }));
vi.mock("@/server/mail-client", () => ({ sendEmail: state.send }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: state.booking }));
vi.mock("@/server/concierge-tools", () => ({ searchListings: state.search, getListingDetails: state.details, checkAvailability: state.availability, getIslandInfo: state.island, compareListings: state.compare }));
import { POST } from "@/app/api/chat/route";
import { renderConciergeResponse } from "@/server/concierge-response";
import { unconfirmedVisitorFacts } from "@/server/concierge-factual-status";

const listing = (overrides: Record<string, unknown> = {}) => ({ title: "Directory Beach Cafe", slug: "beach-cafe", island: "grenada", islandName: "Grenada", type: "dining", visitorFacts: unconfirmedVisitorFacts(), price: null, currency: "XCD", bookingEligible: false, rating: 4.8, image: null, ...overrides });
const request = (extra: Record<string, unknown> = {}, signal?: AbortSignal) => new Request("https://test.invalid/api/chat", { method: "POST", signal, body: JSON.stringify({ messages: [{ role: "user", content: "Suggest a free place for a beach day. Do not contact anyone." }], ...extra }) });
const tool = (name: string, input: unknown = {}) => ({ type: "tool_use", id: name, name, input });
const turn = (...content: unknown[]) => Response.json({ content, stop_reason: content.some(value => (value as { type?: string }).type === "tool_use") ? "tool_use" : "end_turn" });
const plan = (refs = [{ island: "grenada", slug: "beach-cafe" }], topics: string[] = []) => tool("respond_with_plan", { kind: refs.length ? "directory" : "platform", listingRefs: refs, topics });
const draft = (text: string) => ({ type: "text", text });
function provider(...responses: Response[]) {
  const fetch = vi.fn<(_url: string, _init: RequestInit) => Promise<Response>>();
  responses.forEach(response => fetch.mockResolvedValueOnce(response)); vi.stubGlobal("fetch", fetch); return fetch;
}
beforeEach(() => {
  Object.values(state).forEach(mock => mock.mockReset());
  state.actor.mockResolvedValue(null); state.booking.mockResolvedValue(false); state.execute.mockResolvedValue({ rows: [] });
  state.send.mockResolvedValue({ data: { id: "synthetic-notification" } }); state.search.mockResolvedValue([listing()]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([null, 0, 25])("does not turn platform price %j into visitor access, even when the model adds an unconfirmed footnote", async price => {
  state.booking.mockResolvedValue(true); state.search.mockResolvedValue([listing({ price, bookingEligible: true })]);
  provider(turn(tool("search_listings", { island: "grenada" })), turn(draft("No bookings needed, just show up. Open daily 9 AM–5 PM. Admission and visitor access are unconfirmed.")));
  const response = await POST(request()); const body = await response.json();
  expect(response.status).toBe(200); expect(body.message).toContain("Directory Beach Cafe");
  expect(body.message).toContain("opening hours and reservation requirements are unconfirmed");
  expect(body.message).not.toContain("just show up"); expect(body.message).not.toContain("9 AM");
  expect(body.listings).toHaveLength(1); expect(body.listings[0].currency).toBe("XCD");
});
it("ignores unsafe narrative accompanying a valid terminal plan and does not execute another provider turn", async () => {
  const fetch = provider(turn(tool("search_listings")), turn(draft("Free admission; no reservation required."), plan()));
  const body = await (await POST(request())).json();
  expect(body.message).not.toContain("Free admission"); expect(body.message).toContain("are unconfirmed");
  expect(fetch).toHaveBeenCalledTimes(2); expect(body.listings[0]).toMatchObject({ price: null, bookingEligible: false });
});
it.each(["You can walk right in without a reservation.", "La entrada es gratis y está abierto ahora.", "Fort George is open to visitors until sunset."])("rejects an unsupported no-tool draft: %s", async unsafe => {
  provider(turn(draft(unsafe)));
  const body = await (await POST(request({ context: { listingTitle: "Fort George", island: "grenada" }, messages: [{ role: "assistant", content: unsafe }, { role: "user", content: "Is that confirmed?" }] }))).json();
  expect(body.message).not.toContain(unsafe); expect(body.message).toContain("Which destination or topic");
  expect(body.message).not.toContain("no matches"); expect(body.listings).toBeUndefined();
});
it("does not promote imported descriptions, hours, reviews or URLs into current visitor facts", async () => {
  state.details.mockResolvedValue(listing({ description: "Free entry, open daily9–5", headline: "Walk right in", typeData: { hours: "9–5", publicAccess: true }, recentReviews: [{ comment: "No booking required" }], url: "https://untrusted.invalid/free" }));
  provider(turn(tool("get_listing_details", { island: "grenada", slug: "beach-cafe" })), turn(plan()));
  const body = await (await POST(request())).json();
  expect(body.message).toContain("Directory Beach Cafe");
  for (const unsupported of ["9–5", "Walk right in", "No booking required", "untrusted.invalid"]) expect(body.message).not.toContain(unsupported);
  expect(body.listings[0].url).toBe("/grenada/beach-cafe");
});
it.each([
  { kind: "directory", listingRefs: [{ island: "barbados", slug: "beach-cafe" }], topics: [] },
  { kind: "directory", listingRefs: [{ island: "grenada", slug: "forged" }], topics: [] },
  { kind: "directory", listingRefs: [{ island: "grenada", slug: "beach-cafe" }], topics: [], narrative: "Open now" },
  { kind: "platform", listingRefs: [], topics: ["Open now"] },
  { kind: "directory", listingRefs: "not-an-array", topics: [] },
  { kind: ["platform"], listingRefs: [], topics: ["support"] },
])("rejects malformed/forged response plans while keeping genuine directory results: %j", async input => {
  provider(turn(tool("search_listings")), turn(tool("respond_with_plan", input)));
  const body = await (await POST(request())).json();
  expect(body.listings.map((item: { url: string }) => item.url)).toEqual(["/grenada/beach-cafe"]);
  expect(body.message).toContain("are unconfirmed"); expect(body.message).not.toContain("Open now");
});
it("keys selections by destination and slug and derives nested island references only from the tool parent", async () => {
  state.island.mockResolvedValue({ slug: "barbados", name: "Barbados", topRated: [listing({ island: undefined, islandName: undefined, title: "Barbados Cafe" })] });
  const fetch = provider(turn(tool("search_listings"), tool("get_island_info", { island: "barbados" })), turn(plan([{ island: "barbados", slug: "beach-cafe" }])));
  const body = await (await POST(request({ context: { island: "grenada" } }))).json();
  expect(body.listings).toHaveLength(1); expect(body.listings[0]).toMatchObject({ title: "Barbados Cafe", island: "barbados", url: "/barbados/beach-cafe" });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not treat an available booking date as venue opening/access evidence", async () => {
  state.availability.mockResolvedValue({ available: true, bookingEligible: true, visitorFacts: unconfirmedVisitorFacts() });
  provider(turn(tool("check_availability", { listingId: "synthetic", date: "2099-12-20" })), turn(plan([], ["visitor_facts", "booking_status"])));
  const body = await (await POST(request())).json();
  expect(body.message).toContain("visitor access"); expect(body.message).toContain("unconfirmed"); expect(body.listings).toBeUndefined();
});
it("preserves free business claim/signup guidance without a blanket free-word filter", async () => {
  provider(turn(plan([], ["claim_business", "add_business"])));
  const body = await (await POST(request())).json();
  expect(body.message).toContain("for free"); expect(body.message).toContain("/for-businesses"); expect(body.message).toContain("/auth/signup?role=operator&next=/operator/listings/new");
});
const inquiry = () => tool("submit_support_or_business_inquiry", { email: "synthetic@fixture.invalid", category: "General", subject: "Synthetic request", message: "Synthetic offline test only" });
const supportRequest = () => request({ messages: [{ role: "user", content: "Please submit my General support inquiry: Synthetic request, Synthetic offline test only. Reply to synthetic@fixture.invalid." }] });
it("offers support guidance without giving the model an email submission tool", async () => {
  const fetch = provider(turn(plan([], ["support"])));
  const body = await (await POST(supportRequest())).json();
  const payload = JSON.parse(String(fetch.mock.calls[0][1].body));
  expect(payload.tools.some((value: { name: string }) => value.name === "submit_support_or_business_inquiry")).toBe(false);
  expect(payload.system).not.toContain("call the `submit_support_or_business_inquiry` tool");
  expect(body.message).toContain("Contact form (/contact)"); expect(body.message).toContain("review and send");
  expect(state.send).not.toHaveBeenCalled(); expect(body.message).not.toMatch(/VG-CHAT-/);
});
it("does not execute an obsolete submission call even when a valid terminal plan appears in the same turn", async () => {
  const fetch = provider(turn(plan([], ["support"]), inquiry()));
  const body = await (await POST(supportRequest())).json();
  expect(state.send).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  expect(body.message).toContain("/contact"); expect(body.message).not.toMatch(/VG-CHAT-/);
});
it("never sends email for repeated obsolete model calls and gives one safe Contact notice", async () => {
  const fetch = provider(turn(inquiry()), turn(inquiry()), turn(plan([], ["support"])));
  const response = await POST(supportRequest()); const body = await response.json();
  expect(response.status).toBe(200); expect(state.send).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(3);
  const secondResult = JSON.parse(JSON.parse(String(fetch.mock.calls[2][1].body)).messages.at(-1).content[0].content);
  expect(secondResult).toMatchObject({ error: "Unknown tool: submit_support_or_business_inquiry" });
  expect(body.message.match(/\/contact/g)).toHaveLength(1); expect(body.message).not.toMatch(/VG-CHAT-/);
});
it("never accepts a model's invented submission receipt for an obsolete tool", async () => {
  provider(turn(inquiry()), turn(draft("Sent successfully: VG-CHAT-FORGED")));
  const body = await (await POST(supportRequest())).json();
  expect(body.message).toContain("/contact"); expect(body.message).not.toContain("FORGED"); expect(body.message).not.toContain("submitted"); expect(state.send).not.toHaveBeenCalled();
});
it("keeps a generic saved-memory receipt if the provider later throws and never echoes private contents", async () => {
  state.actor.mockResolvedValue({ userId: "10000000-0000-4000-8000-000000000001", role: "traveler", email: "synthetic@fixture.invalid", emailVerified: true, sessionVersion: 1 });
  state.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "memory" }] });
  const fetch = provider(turn(tool("save_memory", { category: "preference", fact: "PRIVATE medical preference" })));
  fetch.mockRejectedValueOnce(new Error("synthetic-later-transport-failure"));
  const response = await POST(request({ messages: [{ role: "user", content: "Remember this private travel preference for later." }] })); const body = await response.json();
  expect(response.status).toBe(200); expect(body.message).toContain("A preference was saved"); expect(body.message).not.toContain("PRIVATE");
});
it("bounds an in-flight action with the existing35s deadline and returns an unconfirmed receipt without replay", async () => {
  const deadline = new AbortController(); vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  let entered!: () => void, rejectLater!: (reason: Error) => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  state.actor.mockResolvedValue({ userId: "10000000-0000-4000-8000-000000000001", role: "traveler", email: "synthetic@fixture.invalid", emailVerified: true, sessionVersion: 1 });
  state.execute.mockResolvedValueOnce({ rows: [] }).mockImplementationOnce(() => { entered(); return new Promise((_resolve, reject) => { rejectLater = reject; }); });
  const fetch = provider(turn(tool("save_memory", { category: "preference", fact: "PRIVATE synthetic travel preference" }))); const pending = POST(request()); await started; deadline.abort(new Error("synthetic-deadline"));
  const response = await pending; const body = await response.json();
  expect(response.status).toBe(200); expect(body.message).toContain("No new saved memory was confirmed"); expect(body.message).not.toContain("PRIVATE");
  expect(AbortSignal.timeout).toHaveBeenCalledWith(35000); expect(fetch).toHaveBeenCalledTimes(1); expect(state.execute).toHaveBeenCalledTimes(2); expect(state.send).not.toHaveBeenCalled();
  rejectLater(new Error("synthetic-late-send-failure")); await Promise.resolve();
});
it("keeps the four-turn provider bound, shared signal and voice token limit", async () => {
  const fetch = vi.fn(async () => turn(tool("search_listings"))); vi.stubGlobal("fetch", fetch);
  const response = await POST(request({ voiceMode: true })); expect(response.status).toBe(200); expect(fetch).toHaveBeenCalledTimes(4);
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  for (const [url, init] of calls) { expect(url).toBe("https://api.anthropic.com/v1/messages"); expect(init.signal).toBe(calls[0][1].signal); expect(JSON.parse(String(init.body))).toMatchObject({ model: "synthetic-model", max_tokens: 300 }); }
});
it.each([["en", "Which destination"], ["es", "¿Qué destino"], ["fr", "Quelle destination"], ["pt", "Qual destino"], ["nl", "Welke bestemming"], ["de", "Welches Reiseziel"]])("renders fixed localized clarification in %s", async (locale, expected) => {
  provider(turn(tool("respond_with_plan", { kind: "clarify", listingRefs: [], topics: ["choose_destination"] })));
  expect((await (await POST(request({ locale }))).json()).message).toBe(`${expected}${({ en: " would you like to explore?", es: " quieres explorar?", fr: " souhaitez-vous explorer ?", pt: " você quer explorar?", nl: " wil je verkennen?", de: " möchtest du erkunden?" } as Record<string, string>)[locale]}`);
});
it("discloses language fallback and rejects nonfinite ratings or ambiguous closed-launch prices", () => {
  const body = renderConciergeResponse({ locale: "ar", results: [{ name: "search_listings", result: [listing({ rating: Infinity, price: 25, bookingEligible: true })] }] });
  expect(body.message).toContain("Language fallback: English."); expect(body.listings?.[0]).toMatchObject({ rating: null, price: null, bookingEligible: false });
});
it("honors a supported requested language even when the browser locale is English", async () => {
  provider(turn(tool("search_listings")), turn(draft("Free entry, open now."), tool("respond_with_plan", { kind: "directory", listingRefs: [{ island: "grenada", slug: "beach-cafe" }], topics: [], language: "es" })));
  const body = await (await POST(request({ locale: "en", messages: [{ role: "user", content: "Responde en español: ¿puedo entrar gratis?" }] }))).json();
  expect(body.message).toContain("no están confirmados"); expect(body.message).not.toContain("Free entry"); expect(body.message).not.toContain("Language fallback");
});
it("rejects an unsupported plan language and explicitly uses the incoming locale as fallback", async () => {
  provider(turn(tool("respond_with_plan", { kind: "clarify", listingRefs: [], topics: ["choose_destination"], language: "unsupported-language" })));
  const body = await (await POST(request({ locale: "es" }))).json();
  expect(body.message).toContain("Idioma alternativo: español."); expect(body.message).toContain("¿Qué destino o tema"); expect(body.message).not.toContain("unsupported-language");
});
