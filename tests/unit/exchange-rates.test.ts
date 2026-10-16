// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-10-16T12:00:00Z"); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("shares one validated rate snapshot between concurrent callers and the public API", async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ result: "success", rates: { USD: 99, EUR: 0.8, GBP: 0, CAD: -2, XCD: Infinity, BBD: "2", JMD: NaN, XYZ: 1 } }) }));
  vi.stubGlobal("fetch", fetch);
  const { getExchangeRates } = await import("@/server/exchange-rates");
  const [one, two] = await Promise.all([getExchangeRates(), getExchangeRates()]);
  expect(fetch).toHaveBeenCalledTimes(1); expect(one).toEqual(two);
  expect(one.rates).toMatchObject({ USD: 1, EUR: 0.8, GBP: 0.79, CAD: 1.36, XCD: 2.7, BBD: 2, JMD: 155 });
  expect(one.rates.XYZ).toBeUndefined(); expect(Object.values(one.rates).every(rate => Number.isFinite(rate) && rate > 0)).toBe(true);
  const { GET } = await import("@/app/api/exchange-rates/route");
  expect(await (await GET()).json()).toMatchObject({ rates: one.rates, updatedAt: one.updatedAt, source: "cache" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("bounds provider failure with fallback estimates and retries after the short fallback cache expires", async () => {
  const fetch = vi.fn(async () => { throw new Error("Synthetic unavailable provider"); }); vi.stubGlobal("fetch", fetch);
  const { getExchangeRates } = await import("@/server/exchange-rates");
  expect(await getExchangeRates()).toMatchObject({ source: "fallback", rates: { USD: 1, EUR: 0.92, COP: 4150 } });
  vi.setSystemTime("2026-10-16T12:00:30Z"); await getExchangeRates(); expect(fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime("2026-10-16T12:01:01Z"); await getExchangeRates(); expect(fetch).toHaveBeenCalledTimes(2);
});
