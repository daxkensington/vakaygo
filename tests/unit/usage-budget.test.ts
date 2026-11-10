// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ SESSION_SECRET: () => new TextEncoder().encode("synthetic-session-secret-for-tests-only") }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => { throw new Error("unexpected real database access"); } }));

import { budgetBucket, budgetRefusal, consumeUsageBudget, resetUsageBudgetMemory } from "@/server/usage-budget";
import { USAGE_BUDGETS, exceededBudget, secondsUntilUtcMidnight } from "@/lib/usage-budget-policy";

const NOW = new Date("2026-11-10T18:30:00Z");
const anon = { ip: "203.0.113.9" };
const rows = (callerCalls: number | null, globalCalls: number, callerUnits: number | null = 0, globalUnits = 0) =>
  async () => [{ globalCalls, globalUnits, callerCalls, callerUnits }];

beforeEach(() => { resetUsageBudgetMemory(); vi.clearAllMocks(); });

describe("budget policy", () => {
  it("caps the whole site before any one caller, because callers are cheap to mint", () => {
    const b = USAGE_BUDGETS.concierge;
    expect(exceededBudget("concierge", { callerCalls: 1, callerUnits: 0, globalCalls: b.globalCalls, globalUnits: 0 }, false)).toBeNull();
    expect(exceededBudget("concierge", { callerCalls: 1, callerUnits: 0, globalCalls: b.globalCalls + 1, globalUnits: 0 }, false)).toBe("global");
    expect(exceededBudget("concierge", { callerCalls: b.perCallerCalls + 1, callerUnits: 0, globalCalls: b.globalCalls + 1, globalUnits: 0 }, false)).toBe("global");
  });

  it("gives an anonymous address less than a signed-in account", () => {
    const b = USAGE_BUDGETS.concierge;
    const counts = { callerCalls: b.perCallerCalls + 1, callerUnits: 0, globalCalls: 10, globalUnits: 0 };
    expect(exceededBudget("concierge", counts, false)).toBe("caller");
    expect(exceededBudget("concierge", counts, true)).toBeNull();
    expect(exceededBudget("concierge", { ...counts, callerCalls: b.perAccountCalls + 1 }, true)).toBe("caller");
  });

  it("budgets speech by characters as well as calls", () => {
    const b = USAGE_BUDGETS.tts;
    expect(exceededBudget("tts", { callerCalls: 2, callerUnits: b.perCallerUnits! + 1, globalCalls: 2, globalUnits: 100 }, false)).toBe("caller");
    expect(exceededBudget("tts", { callerCalls: 2, callerUnits: 100, globalCalls: 2, globalUnits: b.globalUnits! + 1 }, false)).toBe("global");
    // The whole day's speech stays a small, known amount of money: 400,000 characters at US$15 per million.
    expect(b.globalUnits! * 15 / 1_000_000).toBeLessThanOrEqual(10);
  });

  it("starts again at the next UTC midnight", () => {
    expect(secondsUntilUtcMidnight(NOW)).toBe(5.5 * 3600);
    expect(secondsUntilUtcMidnight(new Date("2026-11-10T23:59:59.500Z"))).toBe(1);
  });
});

describe("consumeUsageBudget", () => {
  it("counts the call for the site and the caller in one statement and allows it while both fit", async () => {
    const query = vi.fn(rows(3, 40));
    expect(await consumeUsageBudget("smart_search", anon, 0, { now: NOW, query })).toEqual({ allowed: true, durable: true });
    expect(query).toHaveBeenCalledTimes(1);
    const [text, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(text).toContain("INSERT INTO usage_budget_counters");
    expect(text).toContain("ON CONFLICT (day,feature,bucket) DO UPDATE");
    expect(text).toContain("AT TIME ZONE 'utc'");
    expect(params).toEqual(["smart_search", budgetBucket(anon), 0, USAGE_BUDGETS.smart_search.globalCalls, null]);
  });

  it("never stores the visitor's address, and keys an account by its id", () => {
    const bucket = budgetBucket(anon);
    expect(bucket).toMatch(/^ip:[0-9a-f]{32}$/);
    expect(bucket).not.toContain("203.0.113.9");
    expect(budgetBucket({ ip: "203.0.113.9" })).toBe(bucket);
    expect(budgetBucket({ ip: "203.0.113.10" })).not.toBe(bucket);
    expect(budgetBucket({ ip: "203.0.113.9", userId: "18000000-0000-4000-8000-000000000001" })).toBe("user:18000000-0000-4000-8000-000000000001");
  });

  it("refuses the caller who has used today's share and says when it starts again", async () => {
    const limit = USAGE_BUDGETS.concierge.perCallerCalls;
    expect(await consumeUsageBudget("concierge", anon, 0, { now: NOW, query: rows(limit, 50) })).toMatchObject({ allowed: true });
    expect(await consumeUsageBudget("concierge", anon, 0, { now: NOW, query: rows(limit + 1, 51) }))
      .toEqual({ allowed: false, scope: "caller", retryAfter: 5.5 * 3600, durable: true });
  });

  it("refuses everyone once the site ceiling is spent, even a caller on a new address with no row of its own", async () => {
    const ceiling = USAGE_BUDGETS.tts.globalCalls;
    expect(await consumeUsageBudget("tts", { ip: "198.51.100.200" }, 500, { now: NOW, query: rows(null, ceiling + 1, null, 1000) }))
      .toMatchObject({ allowed: false, scope: "global" });
    expect(await consumeUsageBudget("tts", anon, 2000, { now: NOW, query: rows(1, 5, 2000, USAGE_BUDGETS.tts.globalUnits! + 1) }))
      .toMatchObject({ allowed: false, scope: "global" });
  });

  it("passes the characters to be spoken as units and bounds a nonsense value", async () => {
    const query = vi.fn(rows(1, 1, 1800, 1800));
    await consumeUsageBudget("tts", anon, 1800, { now: NOW, query });
    expect((query.mock.calls[0] as unknown as [string, unknown[]])[1].slice(2)).toEqual([1800, USAGE_BUDGETS.tts.globalCalls, USAGE_BUDGETS.tts.globalUnits]);
    await consumeUsageBudget("tts", anon, Number.POSITIVE_INFINITY, { now: NOW, query });
    await consumeUsageBudget("tts", anon, -5, { now: NOW, query });
    expect((query.mock.calls[1] as unknown as [string, unknown[]])[1][2]).toBe(0);
    expect((query.mock.calls[2] as unknown as [string, unknown[]])[1][2]).toBe(0);
  });

  it("refuses the call when the meter itself fails: an unmetered paid call is the thing it prevents", async () => {
    const query = vi.fn(async () => { throw Object.assign(new Error("connection reset"), { code: "08006" }); });
    expect(await consumeUsageBudget("concierge", anon, 0, { now: NOW, query })).toEqual({ allowed: false, scope: "unavailable", retryAfter: 60, durable: false });
    expect(await consumeUsageBudget("concierge", anon, 0, { now: NOW, query: async () => [] })).toMatchObject({ allowed: false, scope: "unavailable" });
    expect(await consumeUsageBudget("concierge", anon, 0, { now: NOW, query: async () => [{ globalCalls: "x", globalUnits: 0, callerCalls: 1, callerUnits: 0 }] })).toMatchObject({ allowed: false, scope: "unavailable" });
  });

  it("enforces the same limits from memory until migration 0021 has created the table", async () => {
    const missing = vi.fn(async () => { throw Object.assign(new Error('relation "usage_budget_counters" does not exist'), { code: "42P01" }); });
    const limit = USAGE_BUDGETS.concierge.perCallerCalls;
    for (let call = 1; call <= limit; call++) {
      expect(await consumeUsageBudget("concierge", anon, 0, { now: NOW, query: missing })).toEqual({ allowed: true, durable: false });
    }
    expect(await consumeUsageBudget("concierge", anon, 0, { now: NOW, query: missing })).toMatchObject({ allowed: false, scope: "caller", durable: false });
    // Another address still fits, and the database is not asked again on every call.
    expect(await consumeUsageBudget("concierge", { ip: "198.51.100.1" }, 0, { now: NOW, query: missing })).toMatchObject({ allowed: true });
    expect(missing).toHaveBeenCalledTimes(1);
    // It looks again after a minute, and a new day starts the memory counts over.
    const later = new Date(NOW.getTime() + 61_000);
    await consumeUsageBudget("concierge", { ip: "198.51.100.1" }, 0, { now: later, query: missing });
    expect(missing).toHaveBeenCalledTimes(2);
    expect(await consumeUsageBudget("concierge", anon, 0, { now: new Date("2026-11-11T00:00:05Z"), query: missing })).toMatchObject({ allowed: true });
  });

  it("holds the site ceiling in memory too, without growing an entry per rotating address", async () => {
    const missing = async () => { throw Object.assign(new Error("missing"), { code: "42P01" }); };
    const ceiling = USAGE_BUDGETS.phone_sms.globalCalls;
    for (let call = 0; call < ceiling; call++) {
      expect((await consumeUsageBudget("phone_sms", { ip: "x", userId: `user-${call}` }, 0, { now: NOW, query: missing })).allowed).toBe(true);
    }
    expect(await consumeUsageBudget("phone_sms", { ip: "x", userId: "one-more" }, 0, { now: NOW, query: missing })).toMatchObject({ allowed: false, scope: "global" });
  });
});

describe("budgetRefusal", () => {
  it("answers 429 with Retry-After for a spent budget and 503 when the meter is down, never a provider detail", async () => {
    const spent = budgetRefusal("concierge", { allowed: false, scope: "global", retryAfter: 1234, durable: true });
    expect(spent.status).toBe(429);
    expect(spent.headers.get("retry-after")).toBe("1234");
    expect(spent.headers.get("cache-control")).toBe("no-store");
    expect(await spent.json()).toMatchObject({ code: "USAGE_BUDGET_EXHAUSTED", scope: "global", retryAfter: 1234 });
    const own = await budgetRefusal("tts", { allowed: false, scope: "caller", retryAfter: 60, durable: true }).json();
    expect(own.error).toMatch(/Text replies still work/);
    const down = budgetRefusal("smart_search", { allowed: false, scope: "unavailable", retryAfter: 60, durable: false });
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ code: "USAGE_BUDGET_UNAVAILABLE" });
  });
});
