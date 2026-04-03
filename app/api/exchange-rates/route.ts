// Exchange Rates API — fetches live rates with 1-hour in-memory cache

const SUPPORTED_CURRENCIES = ["USD", "XCD", "EUR", "GBP", "CAD", "BBD", "JMD", "TTD"] as const;

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  XCD: 2.70,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  BBD: 2.00,
  JMD: 155.0,
  TTD: 6.78,
};

let cachedRates: { rates: Record<string, number>; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  const now = Date.now();

  // Return cached rates if still valid
  if (cachedRates && now - cachedRates.timestamp < CACHE_TTL) {
    return Response.json({
      rates: cachedRates.rates,
      updatedAt: cachedRates.timestamp,
      source: "cache",
    });
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`API returned ${res.status}`);

    const data = await res.json();

    if (data.result !== "success" || !data.rates) {
      throw new Error("Invalid response from exchange rate API");
    }

    // Extract only the currencies we care about
    const rates: Record<string, number> = {};
    for (const code of SUPPORTED_CURRENCIES) {
      rates[code] = data.rates[code] ?? FALLBACK_RATES[code] ?? 1;
    }

    cachedRates = { rates, timestamp: now };

    return Response.json({
      rates,
      updatedAt: now,
      source: "live",
    });
  } catch (err) {
    console.error("Exchange rate fetch failed, using fallback:", err);

    // Use fallback rates but don't cache them long
    return Response.json({
      rates: FALLBACK_RATES,
      updatedAt: cachedRates?.timestamp ?? now,
      source: "fallback",
    });
  }
}
