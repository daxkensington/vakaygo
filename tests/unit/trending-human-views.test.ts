// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ migrated: true, where: null as unknown }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }));
vi.mock("@/server/business-onboarding", () => ({ bookingLaunchEnabled: async () => false }));
vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: () => {
    const chain = {
      from: () => chain, innerJoin: () => chain, groupBy: () => chain, orderBy: () => chain,
      where: (value: unknown) => { state.where = value; return chain; },
      limit: async () => [],
    };
    return { select: () => chain, execute: async () => ({ rows: state.migrated ? [{ ok: 1 }] : [] }) };
  },
}));
import { GET } from "@/app/api/listings/trending/route";
import { forgetViewAttributionState } from "@/server/listing-view-attribution";

const where = () => new PgDialect().sqlToQuery(state.where as SQL).sql;
beforeEach(() => { forgetViewAttributionState(); state.migrated = true; state.where = null; });

it("ranks trending listings on people's views only", async () => {
  expect((await GET()).status).toBe(200);
  expect(where()).toContain('"listing_views"."is_bot" = false');
});

it("still answers on a database without the bot flag", async () => {
  state.migrated = false;
  expect((await GET()).status).toBe(200);
  expect(where()).not.toContain("is_bot");
});
