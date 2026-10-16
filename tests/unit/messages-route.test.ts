import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ auth: vi.fn(), responses: [] as unknown[][], replayRows: [] as unknown[][], inserts: [] as Record<string, unknown>[], insertResult: [] as unknown[], updates: [] as unknown[], queries: [] as unknown[], updateResult: [] as unknown[], insertError: null as unknown }));
vi.mock("@/server/admin-auth", () => ({ requireUser: state.auth }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/server/db", () => ({ createDb: () => ({
  select: (columns?: unknown) => { const chain = { from: () => chain, innerJoin: () => chain, where: (condition: unknown) => { state.queries.push(condition); return chain; }, orderBy: (...order: unknown[]) => { state.queries.push({ order }); return chain; }, limit: async () => columns === undefined ? state.replayRows.shift() || [] : state.responses.shift() || [], then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(state.responses.shift() || []).then(resolve) }; return chain; },
  insert: () => ({ values: (values: Record<string, unknown>) => { state.inserts.push(values); return { onConflictDoNothing: () => ({ returning: async () => { if (state.insertError) throw state.insertError; return state.insertResult; } }) }; } }),
  update: () => ({ set: (values: unknown) => ({ where: (condition: unknown) => { state.updates.push({ values, condition }); return Object.assign(Promise.resolve(), { returning: async () => state.updateResult }); } }) }),
}) }));
import { GET, PATCH, POST } from "@/app/api/messages/route";
import { parseMessageInput } from "@/lib/message-input";
const traveler = "10000000-0000-4000-8000-000000000002", operator = "10000000-0000-4000-8000-000000000001", outsider = "10000000-0000-4000-8000-000000000003";
const listing = "20000000-0000-4000-8000-000000000001", booking = "30000000-0000-4000-8000-000000000001", sendId = "40000000-0000-4000-8000-000000000001";
const date = new Date("2026-10-13T12:00:00Z");
const payload = { receiverId: operator, content: "Are you open tomorrow?", listingId: listing, clientMessageId: sendId };
const request = (body: unknown, method = "POST") => new Request("https://vakaygo.com/api/messages", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  state.auth.mockReset().mockResolvedValue({ ok: true, userId: traveler, role: "traveler", emailVerified: true, sessionVersion: 4 });
  state.responses = []; state.replayRows = []; state.inserts = []; state.updates = []; state.queries = []; state.insertResult = [{ id: sendId, createdAt: date }]; state.updateResult = []; state.insertError = null;
});
const allowInquiry = () => { state.responses = [[{ id: operator }], [{ operatorId: operator, status: "active", claimVerified: true }]]; };
const compile = (value: unknown) => new PgDialect().sqlToQuery(value as Parameters<PgDialect["sqlToQuery"]>[0]);

describe("message identity and recipient authorization", () => {
  it("rejects revoked sessions before database work for reads, writes and acknowledgments", async () => {
    state.auth.mockResolvedValue({ ok: false, error: new Response(null, { status: 401 }) });
    expect((await GET(new Request("https://vakaygo.com/api/messages"))).status).toBe(401);
    expect((await POST(request(payload))).status).toBe(401);
    expect((await PATCH(request({ with: operator, messageIds: [sendId] }, "PATCH"))).status).toBe(401);
    expect(state.inserts).toEqual([]); expect(state.updates).toEqual([]); expect(state.queries).toEqual([]);
  });
  it("requires inbox proof before sending", async () => {
    state.auth.mockResolvedValue({ ok: true, userId: traveler, emailVerified: false });
    expect((await POST(request(payload))).status).toBe(403); expect(state.inserts).toEqual([]);
  });
  it("delivers a listing inquiry to its verified current owner with the authenticated sender", async () => {
    allowInquiry(); expect((await POST(request({ ...payload, senderId: outsider }))).status).toBe(200);
    expect(state.inserts[0]).toMatchObject({ id: sendId, content: payload.content, listingId: listing });
    expect(compile(state.inserts[0].senderId).params).toEqual([traveler, 4]);
    expect(compile(state.inserts[0].receiverId).params).toEqual([operator, listing, traveler, operator]);
  });
  it.each([{ operatorId: outsider, status: "active", claimVerified: true }, { operatorId: operator, status: "active", claimVerified: false }, { operatorId: operator, status: "paused", claimVerified: true }])("rejects changed ownership, unclaimed or inactive inquiry targets %j", async target => {
    state.responses = [[{ id: operator }], [target]];
    expect((await POST(request(payload))).status).toBe(409); expect(state.inserts).toEqual([]);
  });
  it("allows an operator reply in an existing conversation and verified admin support initiation", async () => {
    state.auth.mockResolvedValue({ ok: true, userId: operator, role: "operator", emailVerified: true });
    state.responses = [[{ id: traveler }], [{ id: sendId }]];
    expect((await POST(request({ receiverId: traveler, content: "Yes, we're open." }))).status).toBe(200);
    state.auth.mockResolvedValue({ ok: true, userId: outsider, role: "admin", emailVerified: true }); state.responses = [[{ id: traveler }]];
    expect((await POST(request({ receiverId: traveler, content: "Support response" }))).status).toBe(200);
  });
  it("does not allow arbitrary new contacts or forged booking associations", async () => {
    state.responses = [[{ id: operator }], []];
    expect((await POST(request({ receiverId: operator, content: "unsolicited" }))).status).toBe(403);
    state.responses = [[{ id: operator }], [{ travelerId: outsider, operatorId: operator, listingId: listing }]];
    expect((await POST(request({ ...payload, bookingId: booking }))).status).toBe(403); expect(state.inserts).toEqual([]);
  });
  it("preserves a real booking party conversation while rejecting unrelated listing context", async () => {
    state.responses = [[{ id: operator }], [{ travelerId: traveler, operatorId: operator, listingId: listing }]];
    expect((await POST(request({ ...payload, bookingId: booking }))).status).toBe(200);
    state.responses = [[{ id: operator }], [{ travelerId: traveler, operatorId: operator, listingId: outsider }]];
    expect((await POST(request({ ...payload, bookingId: booking }))).status).toBe(403);
  });
  it("replays one send ID only for the same sender and normalized payload", async () => {
    allowInquiry(); state.insertResult = []; state.replayRows = [[{ id: sendId, senderId: traveler, ...parseMessageInput(payload)!, createdAt: date }]];
    const replay = await POST(request(payload)); expect(replay.status).toBe(200); expect((await replay.json()).message.id).toBe(sendId);
    allowInquiry(); state.replayRows = [[], []];
    expect((await POST(request(payload))).status).toBe(409);
    allowInquiry(); state.replayRows = [[{ id: sendId, senderId: traveler, ...parseMessageInput(payload)!, content: "different", createdAt: date }]];
    expect((await POST(request(payload))).status).toBe(409);
  });
  it("returns a previously committed own receipt after ownership changes without authorizing another send", async () => {
    state.replayRows = [[{ id: sendId, senderId: traveler, ...parseMessageInput(payload)!, createdAt: date }]];
    const result = await POST(request(payload)); expect(result.status).toBe(200); expect(state.inserts).toEqual([]); expect(state.responses).toEqual([]);
  });
  it("replays uppercase UUID input against the canonical stored receipt", async () => {
    const canonical = { receiverId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", listingId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", bookingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", clientMessageId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", content: "Same message" };
    state.replayRows = [[{ id: canonical.clientMessageId, senderId: traveler, ...parseMessageInput(canonical)!, createdAt: date }]];
    const uppercase = Object.fromEntries(Object.entries(canonical).map(([key, value]) => [key, key.endsWith("Id") ? value.toUpperCase() : value]));
    const result = await POST(request(uppercase));
    expect(result.status).toBe(200); expect((await result.json()).message.id).toBe(canonical.clientMessageId);
    expect(state.inserts).toEqual([]);
  });
  it("reports an atomic rejected write after proof or listing ownership changes", async () => {
    allowInquiry(); state.insertError = { cause: { code: "23502" } };
    const result = await POST(request(payload)); expect(result.status).toBe(409); expect(await result.json()).toMatchObject({ error: expect.stringContaining("changed") });
  });
  it.each([null, [], {}, { ...payload, content: " " }, { ...payload, content: {} }, { ...payload, content: "a".repeat(2001) }, { ...payload, receiverId: "not-uuid" }, { ...payload, listingId: "not-uuid" }, { ...payload, attachmentUrl: "javascript:alert(1)", attachmentType: "file" }])("rejects malformed payload before writes %j", async body => {
    expect((await POST(request(body))).status).toBe(400); expect(state.inserts).toEqual([]);
  });
  it("blocks off-platform contact details pre-booking with 422 and unlocks only on confirmed+paid bookings", async () => {
    for (const blocked of ["Call me at +1 (473) 440-1234", "Email me at guest@example.com", "Message me on WhatsApp", "Visit https://offplatform.com"]) {
      allowInquiry();
      const res = await POST(request({ ...payload, content: blocked }));
      expect(res.status).toBe(422);
      expect(state.inserts).toEqual([]);
    }
    // Pending/unpaid booking still blocked
    state.responses = [[{ id: operator }], [{ travelerId: traveler, operatorId: operator, listingId: listing, status: "pending", paidAt: null }]];
    expect((await POST(request({ ...payload, bookingId: booking, content: "My WhatsApp is +1 473 440 1234" }))).status).toBe(422);
    expect(state.inserts).toEqual([]);
    // Confirmed + paid booking unlocks contact details
    state.responses = [[{ id: operator }], [{ travelerId: traveler, operatorId: operator, listingId: listing, status: "confirmed", paidAt: date }]];
    expect((await POST(request({ ...payload, bookingId: booking, content: "My WhatsApp is +1 473 440 1234" }))).status).toBe(200);
    expect(state.inserts).toHaveLength(1);
  });
});

describe("delivered conversation read state", () => {
  it("shows a newer received reply instead of an older sent preview", async () => {
    state.responses = [[{ id: sendId, senderId: operator, receiverId: traveler, content: "Latest reply", createdAt: date, listingId: listing, isRead: false },
      { id: booking, senderId: traveler, receiverId: operator, content: "Old sent", createdAt: new Date(date.getTime() - 1000), listingId: listing, isRead: false }], [{ name: "Owner" }]];
    const result = await (await GET(new Request("https://vakaygo.com/api/messages"))).json();
    expect(result.conversations[0]).toMatchObject({ lastMessage: "Latest reply", unread: 1, userId: operator });
    const query = compile(state.queries[0]); expect(query.params).toEqual([traveler, traveler]);
  });
  it("returns the newest thread window chronologically without mutating unseen read state", async () => {
    state.responses = [[{ id: sendId, senderId: operator, receiverId: traveler, content: "Newer", createdAt: date, isRead: false }, { id: booking, senderId: traveler, receiverId: operator, content: "Older", createdAt: new Date(date.getTime() - 1000), isRead: true }]];
    const result = await (await GET(new Request(`https://vakaygo.com/api/messages?with=${operator}&listingId=${listing}`))).json();
    expect(result.messages.map((row: { content: string }) => row.content)).toEqual(["Older", "Newer"]); expect(state.updates).toEqual([]);
    const query = compile(state.queries[0]); expect(query.params).toContain(traveler); expect(query.params).toContain(operator); expect(query.params).toContain(listing);
  });
  it("acknowledges only delivered IDs sent by the selected partner to the current account", async () => {
    state.updateResult = [{ id: sendId }]; const response = await PATCH(request({ with: operator, messageIds: [sendId] }, "PATCH"));
    expect(await response.json()).toEqual({ readIds: [sendId] });
    const update = state.updates[0] as { condition: unknown }; expect(compile(update.condition).params).toEqual([traveler, operator, sendId]);
  });
});
