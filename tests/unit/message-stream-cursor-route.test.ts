// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: vi.fn(),
  batches: [] as unknown[][],
  wheres: [] as unknown[],
  executes: 0,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-session" }) }) }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: state.session }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({
  execute: async () => { state.executes++; return { rows: [{ at: "2026-11-10T08:00:00.000000" }] }; },
  select: (shape: Record<string, unknown>) => {
    const inbox = "content" in shape;
    const chain = {
      from: () => chain, innerJoin: () => chain,
      where: (condition: unknown) => { if (inbox) state.wheres.push(condition); return chain; },
      orderBy: () => chain,
      limit: async () => (inbox ? state.batches.shift() ?? [] : []),
    };
    return chain;
  },
}) }));
import { GET } from "@/app/api/messages/stream/route";

const me = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const messageId = "40000000-0000-4000-8000-000000000001";
const compile = (condition: unknown) => new PgDialect().sqlToQuery(condition as SQL);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid/test");
  state.session.mockReset();
  state.batches = []; state.wheres = []; state.executes = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("delivers a message once and starts the next poll after that exact row", async () => {
  // Signed in for the request and the first two polls, then revoked so the stream ends.
  state.session.mockResolvedValueOnce({ userId: me }).mockResolvedValueOnce({ userId: me }).mockResolvedValueOnce({ userId: me }).mockResolvedValue(null);
  state.batches = [[{
    id: messageId, senderId: other, receiverId: me, content: "Hello once",
    createdAt: new Date("2026-11-10T08:00:01.123Z"), cursorAt: "2026-11-10T08:00:01.123456",
  }], [], []];
  const response = await GET();
  const text = response.text();
  await vi.advanceTimersByTimeAsync(10_000);
  const body = await text;

  expect(body.match(/Hello once/g)).toHaveLength(1);
  // The internal cursor text is not part of the event sent to the browser.
  expect(body).not.toContain("cursorAt");
  expect(state.executes).toBe(1);
  // First poll: from the database clock reading. Second poll: strictly after the delivered row.
  const first = compile(state.wheres[0]); const second = compile(state.wheres[1]);
  expect(first.params).toContain("2026-11-10T08:00:00.000000");
  expect(second.sql).toContain('("messages"."created_at", "messages"."id") >');
  expect(second.params).toContain("2026-11-10T08:00:01.123456");
  expect(second.params).toContain(messageId);
});

it("waits between polls even when a batch is full", async () => {
  const full = Array.from({ length: 50 }, (_, index) => ({
    id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`, senderId: other, receiverId: me, content: `m${index}`,
    createdAt: new Date("2026-11-10T08:00:01.000Z"), cursorAt: "2026-11-10T08:00:01.000001",
  }));
  state.session.mockResolvedValue({ userId: me });
  state.batches = [full];
  const response = await GET();
  const reader = response.body!.getReader();
  await vi.advanceTimersByTimeAsync(100);
  // One poll has run; the follow-up for the backlog has not, because it sleeps first.
  expect(state.wheres).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(300);
  expect(state.wheres).toHaveLength(2);
  await reader.cancel();
});
