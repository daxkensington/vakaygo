// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    state.connect();
    return { query: state.query, transaction: state.transaction };
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { DEFAULT_OPEN_DAYS, extendClaimedAvailability } from "@/server/listing-availability";
import { GET } from "@/app/api/cron/availability/route";

const request = () => new Request("http://localhost/api/cron/availability", { headers: { authorization: "Bearer fixture-cron" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid/vakaygo_test");
  vi.stubEnv("CRON_SECRET", "fixture-cron");
  state.transaction.mockImplementation(async callback => Promise.all(callback({ query: state.query })));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("rolling claimed-listing availability", () => {
  it("extends through 90 days inside a single advisory-lock transaction", async () => {
    state.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ candidates: 3, opened: 17 }]);
    await expect(extendClaimedAvailability()).resolves.toEqual({ candidates: 3, opened: 17 });
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(state.query.mock.calls[1][0]).toContain("FROM listing_onboarding");
    expect(state.query.mock.calls[1][0]).not.toContain("UPDATE availability");
    expect(state.query.mock.calls[1][1]).toEqual([DEFAULT_OPEN_DAYS]);
  });

  it("does not connect without a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(extendClaimedAvailability()).resolves.toEqual({ candidates: 0, opened: 0 });
    expect(state.connect).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated cron calls before connecting", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    expect(state.connect).not.toHaveBeenCalled();
  });

  it("returns extension counts from the authenticated cron", async () => {
    state.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ candidates: 3, opened: 17 }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, candidates: 3, opened: 17 });
  });

  it("surfaces extension failures", async () => {
    state.transaction.mockRejectedValueOnce(new Error("synthetic failure"));
    expect((await GET(request())).status).toBe(500);
  });
});
