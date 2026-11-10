// @vitest-environment node
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  migrated: true,
  listing: [{ id: "11111111-1111-4111-8111-111111111111" }] as unknown[],
  recent: [] as unknown[],
  executed: [] as { sql: string; params: unknown[] }[],
  selects: [] as string[],
  headers: new Headers(),
  failInsertOnce: null as null | { code: string },
}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => state.headers, cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/session-validation", () => ({ verifyCurrentSessionToken: vi.fn() }));
vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: () => ({
    select: (fields: Record<string, unknown>) => {
      const kind = Object.keys(fields).join(",");
      const chain = {
        from: (table: unknown) => { state.selects.push(String((table as { [key: symbol]: unknown })[Symbol.for("drizzle:Name")])); return chain; },
        where: () => chain,
        limit: async () => (state.selects[state.selects.length - 1] === "listings" ? state.listing : state.recent),
      };
      void kind;
      return chain;
    },
    execute: async (query: SQL) => {
      const compiled = new PgDialect().sqlToQuery(query);
      state.executed.push({ sql: compiled.sql.replace(/\s+/g, " "), params: compiled.params });
      if (compiled.sql.includes("information_schema.columns")) return { rows: state.migrated ? [{ "?column?": 1 }] : [] };
      if (state.failInsertOnce && compiled.sql.includes("ua_family")) { const failure = state.failInsertOnce; state.failInsertOnce = null; throw Object.assign(new Error("column does not exist"), failure); }
      return { rows: [] };
    },
  }),
}));
import { POST } from "@/app/api/listings/[slug]/view/route";
import { forgetViewAttributionState, humanViews, viewAttributionReady } from "@/server/listing-view-attribution";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
function send(body: unknown = {}, userAgent: string | null = CHROME) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userAgent !== null) headers["user-agent"] = userAgent;
  return POST(new NextRequest("https://vakaygo.com/api/listings/la-ex-tours/view", { method: "POST", body: JSON.stringify(body), headers }), { params: Promise.resolve({ slug: "la-ex-tours" }) });
}
const inserts = () => state.executed.filter((query) => query.sql.startsWith("INSERT INTO listing_views"));

beforeEach(() => {
  vi.clearAllMocks(); forgetViewAttributionState();
  state.migrated = true; state.recent = []; state.executed = []; state.selects = []; state.failInsertOnce = null;
  state.listing = [{ id: "11111111-1111-4111-8111-111111111111" }];
  state.headers = new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9, 10.0.0.1", "x-vercel-ip-country": "ca", "x-vercel-ip-as-number": "812" });
});

describe("POST /api/listings/[slug]/view", () => {
  it("stores a person's view with where it came from", async () => {
    const response = await send({ source: "google", referrerHost: "www.google.com", utmSource: null });
    expect(await response.json()).toEqual({ tracked: true });
    const [insert] = inserts();
    expect(insert.sql).toContain("ua_family, referrer_host, utm_source, country, is_bot, bot_reason");
    expect(insert.params).toEqual(["11111111-1111-4111-8111-111111111111", "203.0.113.9", null, "google", "chrome", "www.google.com", null, "CA", false, null]);
  });

  it("keys the view on the address the platform saw, not on a forwarded-for value the client wrote", async () => {
    state.headers = new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.77, 203.0.113.9" });
    await send({ source: "direct" });
    expect(inserts()[0].params[1]).toBe("203.0.113.9");
    expect(JSON.stringify(state.selects) + JSON.stringify(state.executed)).not.toContain("198.51.100.77");
  });

  it("keeps a campaign tag such as ChatGPT's", async () => {
    await send({ source: "campaign", utmSource: "ChatGPT.com" });
    expect(inserts()[0].params.slice(3, 7)).toEqual(["campaign", "chrome", null, "chatgpt.com"]);
  });

  it("never stores unvalidated client text", async () => {
    await send({ source: "<img onerror=x>", referrerHost: "https://evil.example/path?x=1", utmSource: "a b c" });
    expect(inserts()[0].params.slice(3, 7)).toEqual(["direct", "chrome", null, null]);
  });

  it("keeps a browser on a crawler or hosting network for audit, flagged as a bot", async () => {
    state.headers = new Headers({ "x-real-ip": "116.179.33.47" });
    await send({ source: "direct" });
    expect(inserts()[0].params.slice(8)).toEqual([true, "crawler_network"]);
    state.executed = []; state.headers = new Headers({ "x-real-ip": "203.0.113.10", "x-vercel-ip-as-number": "132203", "x-vercel-ip-country": "CN" });
    await send({ source: "direct" });
    expect(inserts()[0].params.slice(7)).toEqual(["CN", true, "hosting_network"]);
  });

  it("does not store a self-declared bot, a script client or a request without a user agent", async () => {
    for (const userAgent of ["Mozilla/5.0 (compatible; bingbot/2.0)", "python-requests/2.32.3", "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)", null]) {
      expect(await (await send({ source: "direct" }, userAgent)).json()).toEqual({ tracked: false, reason: "bot" });
    }
    expect(state.executed).toHaveLength(0); expect(state.selects).toHaveLength(0);
  });

  it("counts one view per address per listing per hour", async () => {
    state.recent = [{ id: 7 }];
    expect(await (await send({ source: "direct" })).json()).toEqual({ tracked: false, reason: "rate_limited" });
    expect(inserts()).toHaveLength(0);
  });

  it("answers 404 for an unknown listing", async () => {
    state.listing = [];
    expect((await send()).status).toBe(404);
    expect(inserts()).toHaveLength(0);
  });

  it("still counts the view on a database that has not run migration 0019", async () => {
    state.migrated = false;
    expect(await (await send({ source: "google", referrerHost: "www.google.com" })).json()).toEqual({ tracked: true });
    const [insert] = inserts();
    expect(insert.sql).toBe("INSERT INTO listing_views (listing_id, viewer_ip, user_id, source) VALUES ($1, $2, $3, $4)");
    expect(insert.params).toEqual(["11111111-1111-4111-8111-111111111111", "203.0.113.9", null, "google"]);
  });

  it("falls back to the plain insert if the columns disappear under a warm instance", async () => {
    await send(); state.executed = [];
    state.failInsertOnce = { code: "42703" }; state.migrated = false;
    expect(await (await send()).json()).toEqual({ tracked: true });
    expect(inserts().map((query) => query.sql.includes("ua_family"))).toEqual([true, false]);
  });

  it("reports any other database failure instead of hiding it", async () => {
    state.failInsertOnce = { code: "57014" };
    expect((await send()).status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("attribution readiness", () => {
  const compile = (expression: SQL) => new PgDialect().sqlToQuery(expression).sql;
  const db = (rows: unknown[], calls: { n: number }) => ({ execute: async () => { calls.n += 1; return { rows }; } });

  it("filters to people only once the column exists", () => {
    expect(compile(humanViews(true))).toBe('"listing_views"."is_bot" = false');
    expect(compile(humanViews(false))).toBe("true");
  });

  it("remembers a positive answer and re-asks a negative one after a minute", async () => {
    const calls = { n: 0 };
    expect(await viewAttributionReady(db([], calls), 1_000)).toBe(false);
    expect(await viewAttributionReady(db([{ ok: 1 }], calls), 30_000)).toBe(false);
    expect(calls.n).toBe(1);
    expect(await viewAttributionReady(db([{ ok: 1 }], calls), 62_000)).toBe(true);
    expect(await viewAttributionReady(db([], calls), 500_000)).toBe(true);
    expect(calls.n).toBe(2);
  });

  it("treats a failed check as not ready rather than failing the request", async () => {
    expect(await viewAttributionReady({ execute: async () => { throw new Error("unreachable"); } }, 1_000)).toBe(false);
  });
});
