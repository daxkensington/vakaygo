// @vitest-environment node
import { SignJWT } from "jose";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  currentUser: vi.fn(), execute: vi.fn(),
  secret: "synthetic-concierge-session-test-secret-at-least-32-characters",
}));
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgresql://synthetic:synthetic@localhost/offline", ANTHROPIC_API_KEY: "synthetic-unused-key", ANTHROPIC_CONCIERGE_MODEL: "synthetic-model" },
  SESSION_SECRET: () => new TextEncoder().encode(state.secret),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined }) }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => state.currentUser }));
vi.mock("@/server/db", () => ({ createDb: () => ({ execute: state.execute }) }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => false }));
vi.mock("@/server/concierge-tools", () => ({ searchListings: vi.fn(), getListingDetails: vi.fn(), checkAvailability: vi.fn(), getIslandInfo: vi.fn(), compareListings: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { POST } from "@/app/api/chat/route";

const userId = "10000000-0000-4000-8000-000000000001";
const email = "synthetic-traveler@example.invalid";
const memory = "Synthetic private preference: quiet accessible hotels";
const request = () => new Request("https://test.invalid/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "Remember my preference" }] }) });
async function token(sessionVersion = 0, id = userId) {
  return new SignJWT({ id, email, role: "traveler", sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(state.secret));
}
function provider(withMemoryTool = false) {
  const fetch = vi.fn();
  if (withMemoryTool) fetch.mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", id: "save1", name: "save_memory", input: { category: "preference", fact: "Synthetic new preference" } }], stop_reason: "tool_use" }));
  fetch.mockResolvedValue(Response.json({ content: [{ type: "text", text: "Synthetic reply" }], stop_reason: "end_turn" }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
beforeEach(() => {
  vi.clearAllMocks(); state.cookies.clear();
  state.currentUser.mockResolvedValue([{ role: "traveler", email, email_verified: true, session_version: 1 }]);
  state.execute.mockResolvedValue({ rows: [{ category: "preference", fact: memory }] });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["auth_token", "session"])("never loads or saves memory using a revoked JWT in %s", async cookie => {
  state.cookies.set(cookie, await token(0)); const fetch = provider(true);
  expect((await POST(request())).status).toBe(200);
  expect(state.execute).not.toHaveBeenCalled();
  const first = JSON.parse(fetch.mock.calls[0][1].body);
  expect(first.system).not.toContain(memory);
  expect(first.tools.some((tool: { name: string }) => tool.name === "save_memory")).toBe(false);
  const second = JSON.parse(fetch.mock.calls[1][1].body);
  expect(JSON.parse(second.messages.at(-1).content[0].content).saved).toBe(false);
});

it("ignores legacy identity when a different current session is present", async () => {
  state.cookies.set("session", await token(1));
  state.cookies.set("auth_token", await token(1, "10000000-0000-4000-8000-000000000099"));
  const fetch = provider(); expect((await POST(request())).status).toBe(200);
  expect(state.currentUser).toHaveBeenCalledTimes(1);
  const read = new PgDialect().sqlToQuery(state.execute.mock.calls[0][0]);
  expect(read.params.slice(0, 5)).toEqual([userId, 1, "traveler", email, true]);
  expect(read.sql).toContain("FOR SHARE"); expect(read.sql).toContain("session_version=");
  expect(read.sql).toContain("UPDATE concierge_memory");
  expect(JSON.parse(fetch.mock.calls[0][1].body).system).toContain(memory);
});

it("treats a deleted account as anonymous without accessing its memories", async () => {
  state.cookies.set("session", await token(1)); state.currentUser.mockResolvedValue([]);
  provider(); expect((await POST(request())).status).toBe(200); expect(state.execute).not.toHaveBeenCalled();
});

it("rechecks the original actor atomically for a post-provider memory write and reports a rejected write", async () => {
  state.cookies.set("session", await token(1));
  state.execute.mockResolvedValueOnce({ rows: [{ category: "preference", fact: memory }] }).mockResolvedValueOnce({ rows: [] });
  const fetch = provider(true); expect((await POST(request())).status).toBe(200);
  const write = new PgDialect().sqlToQuery(state.execute.mock.calls[1][0]);
  expect(write.params.slice(0, 5)).toEqual([userId, 1, "traveler", email, true]);
  expect(write.sql).toContain("session_version="); expect(write.sql).toContain("FOR SHARE");
  expect(write.sql).toContain("INSERT INTO concierge_memory"); expect(write.sql).toContain("FROM actor");
  const second = JSON.parse(fetch.mock.calls[1][1].body);
  expect(JSON.parse(second.messages.at(-1).content[0].content)).toEqual({ saved: false });
});

it("keeps valid current-session memory writes available", async () => {
  state.cookies.set("session", await token(1));
  state.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "synthetic-memory-id" }] });
  const fetch = provider(true); expect((await POST(request())).status).toBe(200);
  expect(JSON.parse(JSON.parse(fetch.mock.calls[1][1].body).messages.at(-1).content[0].content)).toEqual({ saved: true });
});
