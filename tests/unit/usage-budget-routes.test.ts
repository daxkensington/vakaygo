// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  budget: vi.fn(),
  actor: vi.fn(),
  env: { ANTHROPIC_API_KEY: "synthetic-test-key" as string | undefined, ANTHROPIC_CONCIERGE_MODEL: "claude-sonnet-4-6" },
}));
vi.mock("@/lib/env", () => ({ env: state.env, SESSION_SECRET: () => new TextEncoder().encode("synthetic-session-secret-for-tests-only") }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/server/usage-budget", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/usage-budget")>(), consumeUsageBudget: state.budget,
}));
vi.mock("@/server/admin-auth", () => ({ verifySession: state.actor }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => false }));
vi.mock("@/server/concierge-tools", () => ({
  searchListings: vi.fn(), getListingDetails: vi.fn(), checkAvailability: vi.fn(), getIslandInfo: vi.fn(), compareListings: vi.fn(),
}));
vi.mock("@/server/db", () => ({ createDb: () => { throw new Error("Unexpected database access"); } }));
vi.mock("@/drizzle/schema", () => ({ conciergeMemory: {} }));

import { POST as chat } from "@/app/api/chat/route";
import { POST as smartSearch } from "@/app/api/ai/smart-search/route";
import { POST as searchSummary } from "@/app/api/ai/search-summary/route";
import { POST as tts } from "@/app/api/tts/route";

const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`https://vakaygo.com${path}`, {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.9", ...headers },
});
const calls = {
  concierge: () => chat(post("/api/chat", { messages: [{ role: "user", content: "Where can I snorkel in Grenada?" }] })),
  smart_search: () => smartSearch(post("/api/ai/smart-search", { query: "snorkeling in grenada" })),
  search_summary: () => searchSummary(post("/api/ai/search-summary", { query: "snorkeling", resultCount: 3, topResults: [] })),
  tts: () => tts(post("/api/tts", { text: "Welcome to **Grenada**. See https://example.invalid for more.", personality: "coral" })),
} as const;
type Feature = keyof typeof calls;
const features = Object.keys(calls) as Feature[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue(null);
  state.budget.mockResolvedValue({ allowed: true, durable: true });
  fetchMock = vi.fn(async () => { throw new Error("provider transport stopped by the test"); });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("public paid-provider routes", () => {
  it.each(features)("%s asks the durable budget before it calls the provider", async (feature) => {
    await calls[feature]();
    expect(state.budget).toHaveBeenCalledTimes(1);
    expect(state.budget.mock.calls[0][0]).toBe(feature);
    expect(state.budget.mock.calls[0][1]).toMatchObject({ ip: "203.0.113.9" });
    expect(fetchMock).toHaveBeenCalled();
    expect(state.budget.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
  });

  it.each(features)("%s makes no provider call once the budget is spent, and says when to come back", async (feature) => {
    for (const scope of ["caller", "global"] as const) {
      state.budget.mockResolvedValueOnce({ allowed: false, scope, retryAfter: 7200, durable: true });
      const response = await calls[feature]();
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("7200");
      expect(await response.json()).toMatchObject({ code: "USAGE_BUDGET_EXHAUSTED", scope, retryAfter: 7200 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(features)("%s makes no provider call when the meter is unavailable", async (feature) => {
    state.budget.mockResolvedValueOnce({ allowed: false, scope: "unavailable", retryAfter: 60, durable: false });
    const response = await calls[feature]();
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("USAGE_BUDGET_UNAVAILABLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not spend budget on a request it would reject anyway", async () => {
    expect((await smartSearch(post("/api/ai/smart-search", { query: "   " }))).status).toBe(400);
    expect((await searchSummary(post("/api/ai/search-summary", { query: "x" }))).status).toBe(400);
    expect((await tts(post("/api/tts", { text: "https://only-a-link.invalid" }))).status).toBe(400);
    expect((await chat(post("/api/chat", { messages: [] }))).status).toBe(400);
    state.env.ANTHROPIC_API_KEY = undefined;
    expect((await calls.concierge()).status).toBe(503);
    state.env.ANTHROPIC_API_KEY = "synthetic-test-key";
    expect(state.budget).not.toHaveBeenCalled();
  });

  it("budgets speech by the characters actually sent to the provider", async () => {
    await calls.tts();
    // Markdown and the link are stripped before the text is spoken, and before it is counted.
    expect(state.budget.mock.calls[0][2]).toBe("Welcome to Grenada. See  for more.".length);
    await tts(post("/api/tts", { text: "a".repeat(5000) }));
    expect(state.budget.mock.calls[1][2]).toBe(2000);
  });

  it("counts a signed-in visitor's concierge messages against the account, not the address", async () => {
    state.actor.mockResolvedValue({ userId: "18000000-0000-4000-8000-000000000001", role: "traveler", email: "t@example.invalid" });
    await calls.concierge().catch(() => undefined);
    expect(state.budget.mock.calls[0][1]).toEqual({ ip: "203.0.113.9", userId: "18000000-0000-4000-8000-000000000001" });
  });

  it("keys an anonymous caller on the platform's address, not on a forwarded-for value the client wrote", async () => {
    await smartSearch(post("/api/ai/smart-search", { query: "beach" }, { "x-forwarded-for": "198.51.100.77, 203.0.113.9" }));
    expect(state.budget.mock.calls[0][1]).toEqual({ ip: "203.0.113.9", userId: null });
  });
});
