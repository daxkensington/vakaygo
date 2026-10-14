import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Independent review regressions: synthetic identities and providers only.
const state = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), rows: [] as unknown[][], reads: 0, writes: [] as unknown[], queries: [] as unknown[], fetch: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireUser: state.auth }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: state.session }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-session" }) }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  select: () => { state.reads++; const chain = { from: () => chain, innerJoin: () => chain, where: (condition: unknown) => { state.queries.push(condition); return chain; }, orderBy: () => chain, limit: async () => state.rows.shift() || [] }; return chain; },
  update: () => ({ set: (values: unknown) => ({ where: async () => { state.writes.push(values); } }) }),
}) }));
import { GET as stream } from "@/app/api/messages/stream/route";
import { GET as readTyping, POST as setTyping } from "@/app/api/messages/typing/route";
import { POST as translate } from "@/app/api/messages/translate/route";
import { POST as sendMessage } from "@/app/api/messages/route";
const sender = "10000000-0000-4000-8000-000000000001", receiver = "10000000-0000-4000-8000-000000000002", outsider = "10000000-0000-4000-8000-000000000003", messageId = "40000000-0000-4000-8000-000000000001";
const post = (body: unknown) => new Request("https://vakaygo.com/api/messages", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  state.auth.mockReset().mockResolvedValue({ ok: true, userId: sender, emailVerified: true }); state.session.mockReset();
  state.rows = []; state.reads = 0; state.writes = []; state.queries = []; state.fetch.mockReset();
  vi.stubGlobal("fetch", state.fetch); vi.stubEnv("OPENAI_API_KEY", "synthetic-review-key"); vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid/test");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("rejects an invalid current stream session before reading message data", async () => {
  state.session.mockResolvedValue(null); expect((await stream()).status).toBe(401); expect(state.reads).toBe(0);
});
it("ends an already open stream on revocation before emitting newly queried private messages", async () => {
  state.session.mockResolvedValueOnce({ userId: sender }).mockResolvedValue(null);
  state.rows = [[{ id: messageId, senderId: receiver, receiverId: sender, content: "Private unread reply", createdAt: new Date() }], [{ id: messageId }]];
  const response = await stream(); const text = await response.text();
  expect(text).toContain("event: connected"); expect(text).not.toContain("Private unread reply"); expect(text).not.toContain("message_read"); expect(state.session).toHaveBeenCalledTimes(2);
});
it("requires a current verified account before publishing typing state", async () => {
  state.auth.mockResolvedValueOnce({ ok: false, error: new Response(null, { status: 401 }) }).mockResolvedValueOnce({ ok: true, userId: sender, emailVerified: false });
  expect((await setTyping(post({ receiverId: receiver }))).status).toBe(401); expect((await setTyping(post({ receiverId: receiver }))).status).toBe(403);
});
it("binds typing signals to authenticated sender and recipient rather than supplied identity fields", async () => {
  expect((await setTyping(post({ receiverId: receiver, senderId: outsider }))).status).toBe(200);
  state.auth.mockResolvedValue({ ok: true, userId: receiver, emailVerified: true });
  expect(await (await readTyping(new Request(`https://vakaygo.com/api/messages/typing?senderId=${sender}`))).json()).toEqual({ isTyping: true });
  expect(await (await readTyping(new Request(`https://vakaygo.com/api/messages/typing?senderId=${outsider}`))).json()).toEqual({ isTyping: false });
  state.auth.mockResolvedValue({ ok: true, userId: outsider, emailVerified: true });
  expect(await (await readTyping(new Request(`https://vakaygo.com/api/messages/typing?senderId=${sender}`))).json()).toEqual({ isTyping: false });
});
it("rejects malformed or self-directed typing requests", async () => {
  expect((await setTyping(post({ receiverId: "not-a-uuid" }))).status).toBe(400); expect((await setTyping(post({ receiverId: sender }))).status).toBe(400);
  expect((await readTyping(new Request("https://vakaygo.com/api/messages/typing?senderId=not-a-uuid"))).status).toBe(400);
});
it("rejects revoked translation sessions and invalid IDs before private message reads", async () => {
  state.auth.mockResolvedValueOnce({ ok: false, error: new Response(null, { status: 401 }) });
  expect((await translate(post({ messageId, targetLanguage: "en" }))).status).toBe(401);
  expect((await translate(post({ messageId: "not-a-uuid", targetLanguage: "en" }))).status).toBe(400);
  expect((await translate(post({ messageId, targetLanguage: "en; injected" }))).status).toBe(400); expect(state.reads).toBe(0); expect(state.fetch).not.toHaveBeenCalled();
});
it("denies translation to unrelated users before provider calls or writes", async () => {
  state.rows = [[{ senderId: receiver, receiverId: outsider, content: "Private text" }]];
  expect((await translate(post({ messageId, targetLanguage: "en" }))).status).toBe(403); expect(state.fetch).not.toHaveBeenCalled(); expect(state.writes).toEqual([]);
});
it("translates stored conversation text and returns the corrected response contract", async () => {
  state.rows = [[{ senderId: sender, receiverId: receiver, content: "Stored message only" }]];
  state.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translated: "Translated stored text", sourceLanguage: "fr" }) } }] })));
  const response = await translate(post({ messageId, targetLanguage: "en", text: "Forged client text" }));
  expect(await response.json()).toEqual({ translatedContent: "Translated stored text", sourceLanguage: "fr", targetLanguage: "en" });
  const providerInput = JSON.parse(state.fetch.mock.calls[0][1].body); expect(providerInput.messages[1].content).toBe("Stored message only");
  expect(state.writes).toEqual([{ translatedContent: "Translated stored text", sourceLanguage: "fr", targetLanguage: "en" }]);
});
it("keeps provider translation failures out of message writes", async () => {
  state.rows = [[{ senderId: sender, receiverId: receiver, content: "Stored message only" }]]; state.fetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
  expect((await translate(post({ messageId, targetLanguage: "en" }))).status).toBe(502); expect(state.writes).toEqual([]);
});
it("replays a committed send when accepted UUID fields use a different letter case", async () => {
  const receiptId = "aabbccdd-aaaa-4aaa-8aaa-abcdefabcdef", partnerId = "aabbccdd-bbbb-4bbb-8bbb-abcdefabcdef", listingId = "aabbccdd-cccc-4ccc-8ccc-abcdefabcdef", bookingId = "aabbccdd-dddd-4ddd-8ddd-abcdefabcdef";
  state.rows = [[{ id: receiptId, senderId: sender, receiverId: partnerId, listingId, bookingId, content: "Confirm details", attachmentUrl: null, attachmentType: null, createdAt: new Date() }]];
  const response = await sendMessage(post({ clientMessageId: receiptId.toUpperCase(), receiverId: partnerId.toUpperCase(), listingId: listingId.toUpperCase(), bookingId: bookingId.toUpperCase(), content: "Confirm details" }));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ message: { id: receiptId } }); expect(state.reads).toBe(1); expect(state.writes).toEqual([]);
});
