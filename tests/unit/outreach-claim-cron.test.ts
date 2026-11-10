// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), neon: vi.fn(), refresh: vi.fn(), send: vi.fn(), error: vi.fn(), fetch: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("@/server/outreach-campaign-send", () => ({ refreshOutreachTelemetry: mocks.refresh }));
vi.mock("@/server/outreach-automation", () => ({ sendBusinessInterestOutreachEmail: mocks.send }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error } }));
import { GET } from "@/app/api/cron/enrich-listing-emails/route";

const now = new Date("2026-10-20T14:00:00Z");
const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const control = () => ({ enabled: true, provider: "resend", health_ready: true, health_checked_at: now.toISOString() });
function request({ authorized = true, query = "" } = {}) {
  return new NextRequest(`https://vakaygo.example/api/cron/enrich-listing-emails${query}`, {
    headers: authorized ? { authorization: "Bearer fixture-cron-secret" } : {},
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "fixture-cron-secret");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.neon.mockReturnValue({ query: mocks.query });
  mocks.refresh.mockResolvedValue({ ready: true, reasons: [] });
  mocks.query.mockResolvedValueOnce([control()]).mockResolvedValue([{ id: id1, island_slug: "grenada", email: "one@business.example" }, { id: id2, island_slug: "barbados", email: "two@business.example" }]);
  mocks.send.mockResolvedValue({ sent: true, attemptId: "attempt-fixture" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("dedicated claim invitation drip cron", () => {
  it.each(["", "?runWave=2026-10-16-wave3-drip&bootstrapOperators=1&force=1&limit=1000"])(
    "authenticates before any DB or telemetry access even with legacy bypass query %s", async query => {
      expect((await GET(request({ authorized: false, query }))).status).toBe(401);
      expect(mocks.neon).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it("rejects absent cron configuration before DB/provider work", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("fails closed without database configuration", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await GET(request())).status).toBe(503);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("refreshes telemetry before reading control and stays paused without sending", async () => {
    mocks.query.mockReset().mockResolvedValue([{ ...control(), enabled: false }]);
    const response = await GET(request({ query: "?force=1&runWave=2026-10-16-wave3-drip&bootstrapOperators=1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "paused", attempted: 0, sent: 0 });
    expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(mocks.query.mock.invocationCallOrder[0]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["missing_table", "missing_control", "telemetry_failure", "health_false", "stale_health", "future_health", "unsupported_provider"])(
    "fails closed for %s without a sender call", async fault => {
      mocks.query.mockReset();
      if (fault === "missing_table") mocks.query.mockRejectedValue(new Error("secret database URL"));
      else mocks.query.mockResolvedValue(fault === "missing_control" ? [] : [{ ...control(),
        ...(fault === "health_false" ? { health_ready: false } : {}),
        ...(fault === "stale_health" ? { health_checked_at: "2026-10-20T12:00:00Z" } : {}),
        ...(fault === "future_health" ? { health_checked_at: "2026-10-20T16:00:00Z" } : {}),
        ...(fault === "unsupported_provider" ? { provider: "unconfigured" } : {}),
      }]);
      if (fault === "telemetry_failure") mocks.refresh.mockResolvedValue({ ready: false, reasons: ["mail_unconfigured"] });
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toMatch(/secret|postgres|credential/);
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it("runs only read-only claim candidate queries and invokes the sender at most once", async () => {
    const response = await GET(request({ query: "?limit=1000&bootstrapOperators=1&force=1&runWave=2026-10-16-wave3-drip" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attempted: 1, sent: 1, listingId: id1 });
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(id1, { triggeredBy: "cron" });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    for (const [sql] of mocks.query.mock.calls) {
      expect(sql.trim()).toMatch(/^SELECT /);
      expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|feature_flags|booking_provider_config|availability|listing_onboarding|listing_claims|listing_claim_verifications|trusted_contacts|generate_series|payout/i);
    }
    const candidateSql = mocks.query.mock.calls[1][0];
    // Destinations that cannot be sent to now are excluded before the LIMIT, so they cannot stall the queue.
    expect(candidateSql).toMatch(/i\.slug=ANY\(\$3::text\[\]\)[\s\S]*i\.slug=ANY\(\$4::text\[\]\) AND c\.permission_kind='explicit_opt_in'[\s\S]*ORDER BY l\.id LIMIT 200/);
    expect(candidateSql).toContain("Claim invitation emailed to");
    expect(candidateSql).toContain("outreach_recipient_consents");
    expect(candidateSql).toContain("vakaygo_outreach_permission_allowed(c.provider,c.permission_kind)");
    expect(candidateSql).toContain("revoked_at IS NULL");
    expect(candidateSql).toContain("outreach_email_suppressions");
    expect(candidateSql).toContain("outreach_email_attempts");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("dispatches one reviewed Sendcorex candidate through the shared sender", async () => {
    mocks.query.mockReset().mockResolvedValueOnce([{ ...control(), provider: "sendcorex" }])
      .mockResolvedValue([{ id: id1, island_slug: "grenada", email: "one@business.example" }, { id: id2, island_slug: "barbados", email: "two@business.example" }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attempted: 1, sent: 1, listingId: id1 });
    const [provider, campaign, openSlugs, optInOnlySlugs, restricted] = mocks.query.mock.calls[1][1];
    expect([provider, campaign]).toEqual(["sendcorex", "listing-claims-v2"]);
    // 14:00Z on a Tuesday: the Caribbean is in business hours, the Mediterranean (17:00 local) is not.
    expect(openSlugs).toEqual(expect.arrayContaining(["grenada", "antigua", "st-kitts", "st-vincent", "puerto-rico"]));
    expect(openSlugs).not.toEqual(expect.arrayContaining(["santorini"]));
    for (const slug of ["martinique", "guadeloupe", "cartagena", "medellin"]) {
      expect(openSlugs).not.toContain(slug); expect(optInOnlySlugs).toContain(slug);
    }
    expect(restricted).toEqual(["GR", "ES", "IT", "HR", "CR", "MQ", "GP", "CO"]);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(id1, { triggeredBy: "cron" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps Sendcorex paused even when its telemetry passes", async () => {
    mocks.query.mockReset().mockResolvedValue([{ ...control(), provider: "sendcorex", enabled: false }]);
    const response = await GET(request({ query: "?force=1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "paused", attempted: 0, sent: 0 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not try another recipient when the delivery helper refuses the selected candidate", async () => {
    mocks.send.mockResolvedValue({ sent: false, reason: "daily_cap" });
    const response = await GET(request({ query: "?force=1" }));
    expect(await response.json()).toMatchObject({ attempted: 1, sent: 0, reason: "daily_cap" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("reports the single invocation if delivery throws without exposing its error", async () => {
    mocks.send.mockRejectedValue(new Error("private provider credential"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Claim invitation campaign unavailable", attempted: 1 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unknown_destination", now],
    ["grenada", new Date("2026-10-20T12:59:00Z")],
    ["grenada", new Date("2026-10-20T21:00:00Z")],
    ["grenada", new Date("2026-10-24T14:00:00Z")],
  ])("holds %s outside known weekday business hours", async (slug, instant) => {
    vi.setSystemTime(instant);
    mocks.query.mockReset().mockResolvedValueOnce([{ ...control(), health_checked_at: instant.toISOString() }]).mockResolvedValue([{ id: id1, island_slug: slug, email: "one@business.example" }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attempted: 0, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("skips a quiet destination before the single invocation for a destination in business hours", async () => {
    vi.setSystemTime(new Date("2026-10-20T07:00:00Z"));
    mocks.query.mockReset().mockResolvedValueOnce([{ ...control(), health_checked_at: new Date().toISOString() }])
      .mockResolvedValue([{ id: id1, island_slug: "grenada", email: "one@business.example" }, { id: id2, island_slug: "santorini", email: "two@business.example" }]);
    await GET(request());
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(id2, { triggeredBy: "cron" });
    // Only the Mediterranean is in hours at 07:00Z, and it accepts explicit opt-in only.
    const [, , openSlugs, optInOnlySlugs] = mocks.query.mock.calls[1][1];
    expect(openSlugs).toEqual([]);
    expect(optInOnlySlugs).toEqual(expect.arrayContaining(["santorini", "mykonos", "crete", "ibiza", "mallorca", "amalfi-coast-capri", "hvar-split"]));
  });

  it("skips an address the validator rejects instead of selecting it on every run", async () => {
    mocks.query.mockReset().mockResolvedValueOnce([control()])
      .mockResolvedValue([{ id: id1, island_slug: "grenada", email: "info@hotel.pbz" }, { id: id2, island_slug: "barbados", email: "two@business.example" }]);
    await GET(request());
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(id2, { triggeredBy: "cron" });
  });

  it("does not read candidates when no destination is in business hours", async () => {
    vi.setSystemTime(new Date("2026-10-24T14:00:00Z"));
    mocks.query.mockReset().mockResolvedValueOnce([{ ...control(), health_checked_at: new Date().toISOString() }]);
    expect(await (await GET(request())).json()).toMatchObject({ state: "idle", attempted: 0, sent: 0 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("releases a held country only when the owner lists it", async () => {
    vi.stubEnv("OUTREACH_RELEASED_COUNTRIES", "co, GR, xx");
    await GET(request());
    const [, , openSlugs, optInOnlySlugs, restricted] = mocks.query.mock.calls[1][1];
    expect(openSlugs).toEqual(expect.arrayContaining(["cartagena", "medellin"]));
    expect(optInOnlySlugs).toEqual(expect.arrayContaining(["martinique", "guadeloupe"]));
    // A prior opt-in country cannot be released by configuration.
    expect(restricted).toEqual(["GR", "ES", "IT", "HR", "CR", "MQ", "GP"]);
  });
});
