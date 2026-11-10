// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
import {
  COARSEN_VIEW_ADDRESSES_SQL, RETENTION_BATCH, USAGE_COUNTER_RETENTION_DAYS, VIEW_IP_RETENTION_DAYS,
  coarsenAddress, runPrivacyRetention,
} from "@/server/privacy-retention";
import { GET } from "@/app/api/cron/privacy-retention/route";

afterEach(() => vi.unstubAllEnvs());

describe("coarsenAddress", () => {
  it("keeps the network and drops the host part", () => {
    expect(coarsenAddress("203.0.113.47")).toBe("203.0.113.0");
    expect(coarsenAddress("116.179.33.201")).toBe("116.179.33.0");
    expect(coarsenAddress("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::");
    expect(coarsenAddress("unknown")).toBe("unknown");
  });
  it("still matches the crawler ranges flagged by network prefix", () => {
    expect(coarsenAddress("116.179.33.47").startsWith("116.179.33.")).toBe(true);
  });
});

describe("runPrivacyRetention", () => {
  it("counts only on a dry run", async () => {
    const query = vi.fn(async (text: string) => [{ due: text.includes("listing_views") ? 12 : 3 }]);
    const result = await runPrivacyRetention({ dryRun: true, query });
    expect(result).toEqual({ dryRun: true, viewAddresses: { due: 12, coarsened: 0 }, usageCounters: { due: 3, deleted: 0, tableMissing: false } });
    expect(query.mock.calls.every(([text]) => /^SELECT/.test(text))).toBe(true);
  });

  it("coarsens old view addresses in batches and deletes old counters", async () => {
    const query = vi.fn(async (text: string, params: unknown[]) => {
      if (text === COARSEN_VIEW_ADDRESSES_SQL) { expect(params).toEqual([VIEW_IP_RETENTION_DAYS, RETENTION_BATCH]); return [{ changed: 7 }]; }
      if (text.includes("DELETE FROM usage_budget_counters")) { expect(params).toEqual([USAGE_COUNTER_RETENTION_DAYS]); return [{ deleted: 2 }]; }
      return [{ due: text.includes("listing_views") ? 7 : 2 }];
    });
    expect(await runPrivacyRetention({ query })).toEqual({ dryRun: false, viewAddresses: { due: 7, coarsened: 7 }, usageCounters: { due: 2, deleted: 2, tableMissing: false } });
    expect(COARSEN_VIEW_ADDRESSES_SQL).toContain("UPDATE listing_views");
    expect(COARSEN_VIEW_ADDRESSES_SQL).not.toMatch(/DELETE/i);
  });

  it("tolerates the counters table not existing yet (migration 0021)", async () => {
    const query = vi.fn(async (text: string) => {
      if (text.includes("usage_budget_counters")) throw Object.assign(new Error('relation "usage_budget_counters" does not exist'), { code: "42P01" });
      return [{ due: 0 }];
    });
    expect((await runPrivacyRetention({ query })).usageCounters).toEqual({ due: 0, deleted: 0, tableMissing: true });
  });
});

describe("GET /api/cron/privacy-retention", () => {
  it("refuses a request without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "synthetic-cron");
    expect((await GET(new Request("https://vakaygo.com/api/cron/privacy-retention"))).status).toBe(401);
    expect((await GET(new Request("https://vakaygo.com/api/cron/privacy-retention", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://vakaygo.com/api/cron/privacy-retention", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });
});
