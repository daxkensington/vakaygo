import { logger } from "@/lib/logger";

export const SUPPORTED_CURRENCIES = ["USD", "XCD", "EUR", "GBP", "CAD", "BBD", "JMD", "TTD", "DOP", "MXN", "COP", "CRC"] as const;
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, XCD: 2.70, EUR: 0.92, GBP: 0.79, CAD: 1.36, BBD: 2.00,
  JMD: 155.0, TTD: 6.78, DOP: 60.5, MXN: 20.1, COP: 4150.0, CRC: 512.0,
};
type RateSnapshot = { rates: Record<string, number>; updatedAt: number; source: "live" | "cache" | "fallback" };
let cached: { snapshot: RateSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<RateSnapshot> | null = null;

/** Units of each supported currency per USD. Never trust zero/non-finite provider rates. */
function supportedRates(raw: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(SUPPORTED_CURRENCIES.map(code => {
    const value = raw[code];
    return [code, code === "USD" ? 1 : typeof value === "number" && Number.isFinite(value) && value > 0 ? value : FALLBACK_RATES[code]];
  }));
}

async function refreshRates(): Promise<RateSnapshot> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    if (data?.result !== "success" || !data.rates || typeof data.rates !== "object" || Array.isArray(data.rates)) throw new Error("Invalid exchange rate response");
    const snapshot: RateSnapshot = { rates: supportedRates(data.rates), updatedAt: Date.now(), source: "live" };
    cached = { snapshot, expiresAt: snapshot.updatedAt + 60 * 60 * 1000 };
    return snapshot;
  } catch (error) {
    logger.error("Exchange rate fetch failed, using fallback", error);
    const snapshot: RateSnapshot = { rates: { ...FALLBACK_RATES }, updatedAt: Date.now(), source: "fallback" };
    cached = { snapshot, expiresAt: snapshot.updatedAt + 60 * 1000 };
    return snapshot;
  }
}

/** Shared estimate snapshot for the public API and discovery price comparisons. */
export async function getExchangeRates(): Promise<RateSnapshot> {
  if (cached && Date.now() < cached.expiresAt) return { ...cached.snapshot, source: cached.snapshot.source === "live" ? "cache" : "fallback" };
  if (!inFlight) inFlight = refreshRates().finally(() => { inFlight = null; });
  return inFlight;
}
