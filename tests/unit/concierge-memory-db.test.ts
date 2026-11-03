// @vitest-environment node
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined }) }));
vi.mock("@/lib/env", () => ({
  env: {
    get DATABASE_URL() { return process.env.DATABASE_URL; },
    ANTHROPIC_API_KEY: "synthetic-unused-provider-key", ANTHROPIC_CONCIERGE_MODEL: "synthetic-model",
  },
  SESSION_SECRET: () => new TextEncoder().encode("synthetic-concierge-db-test-secret-32-characters"),
}));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => false }));
vi.mock("@/server/concierge-tools", () => ({ searchListings: vi.fn(), getListingDetails: vi.fn(), checkAvailability: vi.fn(), getIslandInfo: vi.fn(), compareListings: vi.fn() }));
import { createSessionToken } from "@/server/admin-auth";
import { POST } from "@/app/api/chat/route";

const enabled = process.env.VAKAYGO_CONCIERGE_DB_TESTS === "true";
const userId = "17000000-0000-4000-8000-000000000001", email = "concierge@fixture.invalid";
const existingMemory = "Synthetic private travel preference";
let db: NeonQueryFunction<false, false>;
const request = () => new Request("https://test.invalid/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "Remember this synthetic preference" }] }) });

function provider(beforeSave?: () => Promise<unknown>) {
  const original = globalThis.fetch; const prompts: string[] = []; const toolResults: { saved: boolean }[] = []; let turns = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "https://api.anthropic.com/v1/messages") return original(input, init);
    const body = JSON.parse(init!.body as string); prompts.push(body.system);
    if (++turns % 2 === 1) {
      await beforeSave?.();
      return Response.json({ content: [{ type: "tool_use", id: `save${turns}`, name: "save_memory", input: { category: "preference", fact: "Synthetic new travel preference" } }], stop_reason: "tool_use" });
    }
    toolResults.push(JSON.parse(body.messages.at(-1).content[0].content));
    return Response.json({ content: [{ type: "text", text: "Synthetic offline reply" }], stop_reason: "end_turn" });
  });
  return { prompts, toolResults };
}

describe.skipIf(!enabled)("concierge memory against isolated PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || "http://invalid");
    const ownedLocal = url.hostname === "127.0.0.1" && url.port === "5498";
    const hostedFixture = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "5432";
    if ((!ownedLocal && !hostedFixture) || url.pathname !== "/vakaygo_test" || url.username !== "audit") throw new Error("Isolated audit PostgreSQL required");
    db = neon(process.env.DATABASE_URL!);
    await db`INSERT INTO users(id,email,name,role,email_verified,session_version)
      VALUES(${userId},${email},'Concierge synthetic fixture','traveler',true,7) ON CONFLICT(id) DO NOTHING`;
  });
  beforeEach(async () => {
    state.cookies.clear();
    await db`UPDATE users SET email=${email},role='traveler',email_verified=true,session_version=7 WHERE id=${userId}`;
    await db`DELETE FROM concierge_memory WHERE user_id=${userId}`;
    await db`INSERT INTO concierge_memory(user_id,category,fact,last_used_at) VALUES(${userId},'preference',${existingMemory},'2000-01-01')`;
    state.cookies.set("session", await createSessionToken({ id: userId, email, role: "traveler", sessionVersion: 7 }));
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { if (db) await db`DELETE FROM users WHERE id=${userId}`; });

  it("loads and touches only the current actor's memories and saves a new fact once", async () => {
    const ai = provider(); expect((await POST(request())).status).toBe(200);
    expect(ai.prompts[0]).toContain(existingMemory); expect(ai.toolResults[0]).toEqual({ saved: true });
    const touched = await db`SELECT last_used_at>'2000-01-01'::timestamp AS touched FROM concierge_memory WHERE user_id=${userId} AND fact=${existingMemory}`;
    expect(touched[0].touched).toBe(true);
    expect((await POST(request())).status).toBe(200); expect(ai.toolResults[1]).toEqual({ saved: false });
    expect(Number((await db`SELECT count(*) AS n FROM concierge_memory WHERE user_id=${userId}`)[0].n)).toBe(2);
  });

  it.each(["session", "auth_token"])("never reads, touches or saves using a revoked JWT in %s", async cookie => {
    const revoked = state.cookies.get("session")!; state.cookies.clear(); state.cookies.set(cookie, revoked);
    await db`UPDATE users SET session_version=8 WHERE id=${userId}`;
    const ai = provider(); expect((await POST(request())).status).toBe(200);
    expect(ai.prompts[0]).not.toContain(existingMemory); expect(ai.toolResults[0].saved).toBe(false);
    const rows = await db`SELECT fact,last_used_at='2000-01-01'::timestamp AS unchanged FROM concierge_memory WHERE user_id=${userId}`;
    expect(rows).toHaveLength(1); expect(rows[0].unchanged).toBe(true);
  });

  it.each(["epoch", "email", "role", "verification"])("rejects a memory write after a mid-provider %s change", async change => {
    const ai = provider(async () => {
      if (change === "epoch") await db`UPDATE users SET session_version=8 WHERE id=${userId}`;
      if (change === "email") await db`UPDATE users SET email='changed-concierge@fixture.invalid' WHERE id=${userId}`;
      if (change === "role") await db`UPDATE users SET role='operator' WHERE id=${userId}`;
      if (change === "verification") await db`UPDATE users SET email_verified=false WHERE id=${userId}`;
    });
    expect((await POST(request())).status).toBe(200);
    expect(ai.prompts[0]).toContain(existingMemory); expect(ai.toolResults[0]).toEqual({ saved: false });
    expect(Number((await db`SELECT count(*) AS n FROM concierge_memory WHERE user_id=${userId}`)[0].n)).toBe(1);
  });
});
