"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

// ─── Fallback rates (used before live rates load) ──────────────
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  XCD: 2.70,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  TTD: 6.78,
  JMD: 155.0,
  BBD: 2.00,
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  XCD: "EC$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  CAD: "CA$",
  TTD: "TT$",
  JMD: "J$",
  BBD: "Bds$",
};

export const CURRENCY_FLAGS: Record<string, string> = {
  USD: "\uD83C\uDDFA\uD83C\uDDF8",
  XCD: "\uD83C\uDDEC\uD83C\uDDE9",
  EUR: "\uD83C\uDDEA\uD83C\uDDFA",
  GBP: "\uD83C\uDDEC\uD83C\uDDE7",
  CAD: "\uD83C\uDDE8\uD83C\uDDE6",
  TTD: "\uD83C\uDDF9\uD83C\uDDF9",
  JMD: "\uD83C\uDDEF\uD83C\uDDF2",
  BBD: "\uD83C\uDDE7\uD83C\uDDE7",
};

export const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  XCD: "Eastern Caribbean Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  CAD: "Canadian Dollar",
  TTD: "Trinidad & Tobago Dollar",
  JMD: "Jamaican Dollar",
  BBD: "Barbadian Dollar",
};

export const POPULAR_CURRENCIES = ["USD", "EUR", "GBP", "CAD"];
export const CARIBBEAN_CURRENCIES = ["XCD", "BBD", "JMD", "TTD"];
export const CURRENCIES = [...POPULAR_CURRENCIES, ...CARIBBEAN_CURRENCIES];

const LOCALSTORAGE_RATES_KEY = "vakaygo_exchange_rates";
const LOCALSTORAGE_CURRENCY_KEY = "vakaygo_currency";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

type CachedRates = {
  rates: Record<string, number>;
  updatedAt: number;
  source: string;
};

function loadCachedRates(): CachedRates | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_RATES_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedRates;
    if (Date.now() - cached.updatedAt < CACHE_TTL) return cached;
    return null;
  } catch {
    return null;
  }
}

function saveCachedRates(data: CachedRates) {
  try {
    localStorage.setItem(LOCALSTORAGE_RATES_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded — ignore
  }
}

type CurrencyContextValue = {
  currency: string;
  setCurrency: (code: string) => void;
  convert: (amount: number, fromCurrency?: string) => number;
  format: (amount: number, fromCurrency?: string) => string;
  symbol: string;
  rates: Record<string, number>;
  ratesUpdatedAt: number | null;
  ratesLoading: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState("USD");
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<number | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Load persisted currency selection + cached rates
  useEffect(() => {
    const stored = localStorage.getItem(LOCALSTORAGE_CURRENCY_KEY);
    if (stored && FALLBACK_RATES[stored] !== undefined) {
      setCurrencyState(stored);
    }

    const cached = loadCachedRates();
    if (cached) {
      setRates(cached.rates);
      setRatesUpdatedAt(cached.updatedAt);
      setRatesLoading(false);
    }
  }, []);

  // Fetch live rates
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = loadCachedRates();
    if (cached) {
      // Already have fresh cached rates, skip network call
      setRates(cached.rates);
      setRatesUpdatedAt(cached.updatedAt);
      setRatesLoading(false);
      return;
    }

    async function fetchRates() {
      try {
        const res = await fetch("/api/exchange-rates");
        if (!res.ok) throw new Error("Failed to fetch rates");
        const data = await res.json();
        setRates(data.rates);
        setRatesUpdatedAt(data.updatedAt);
        saveCachedRates({ rates: data.rates, updatedAt: data.updatedAt, source: data.source });
      } catch {
        // Keep fallback rates
      } finally {
        setRatesLoading(false);
      }
    }

    fetchRates();
  }, []);

  const setCurrency = useCallback((code: string) => {
    if (FALLBACK_RATES[code] !== undefined) {
      setCurrencyState(code);
      localStorage.setItem(LOCALSTORAGE_CURRENCY_KEY, code);
    }
  }, []);

  const convert = useCallback(
    (amount: number, fromCurrency: string = "USD") => {
      // Convert from source currency to USD first, then to target
      const fromRate = rates[fromCurrency] || 1;
      const toRate = rates[currency] || 1;
      return amount * (toRate / fromRate);
    },
    [currency, rates],
  );

  const format = useCallback(
    (amount: number, fromCurrency: string = "USD") => {
      const converted = convert(amount, fromCurrency);
      const sym = CURRENCY_SYMBOLS[currency] || "$";
      return `${sym}${converted.toFixed(2)}`;
    },
    [currency, convert],
  );

  const symbol = CURRENCY_SYMBOLS[currency] || "$";

  return (
    <CurrencyContext.Provider
      value={{ currency, setCurrency, convert, format, symbol, rates, ratesUpdatedAt, ratesLoading }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
