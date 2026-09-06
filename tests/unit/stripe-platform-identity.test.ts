import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); process.env.STRIPE_SECRET_KEY = "sk_test_synthetic"; process.env.STRIPE_PLATFORM_ACCOUNT_ID = "acct_vakaygo"; });

async function identity(actual = "acct_vakaygo") {
  const retrieve = vi.fn(async () => ({ id: actual }));
  vi.doMock("stripe", () => ({ default: class { accounts = { retrieve }; } }));
  const { verifyStripePlatformIdentity } = await import("@/server/stripe");
  return { verifyStripePlatformIdentity, retrieve };
}

describe("payment operation platform identity", () => {
  it.each([["sk_test_synthetic", "test"], ["rk_test_synthetic", "test"], ["sk_live_synthetic", "live"], ["rk_live_synthetic", "live"]])("verifies the actual platform for %s", async (key, environment) => {
    process.env.STRIPE_SECRET_KEY = key;
    const test = await identity();
    await expect(test.verifyStripePlatformIdentity()).resolves.toEqual({ accountId: "acct_vakaygo", environment });
    expect(test.retrieve).toHaveBeenCalledWith();
  });
  it("rejects another business even if its API key is valid", async () => {
    const test = await identity("acct_other_business");
    await expect(test.verifyStripePlatformIdentity()).rejects.toThrow("configuration mismatch");
  });
  it.each(["", "unknown", "pk_test_not_secret"])("rejects an unrecognized key before provider access: %s", async key => {
    process.env.STRIPE_SECRET_KEY = key;
    const test = await identity();
    await expect(test.verifyStripePlatformIdentity()).rejects.toThrow("not configured");
    expect(test.retrieve).not.toHaveBeenCalled();
  });
  it("requires an explicitly configured platform", async () => {
    delete process.env.STRIPE_PLATFORM_ACCOUNT_ID;
    const test = await identity();
    await expect(test.verifyStripePlatformIdentity()).rejects.toThrow("not configured");
    expect(test.retrieve).not.toHaveBeenCalled();
  });
});
