"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  XCD: 2.70,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  TTD: 6.78,
  JMD: 155.50,
  BBD: 2.00,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  XCD: "EC$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  CAD: "CA$",
  TTD: "TT$",
  JMD: "J$",
  BBD: "Bds$",
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

export const CURRENCIES = Object.keys(EXCHANGE_RATES);

type CurrencyContextValue = {
  currency: string;
  setCurrency: (code: string) => void;
  convert: (amount: number) => number;
  format: (amount: number) => string;
  symbol: string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState("USD");

  useEffect(() => {
    const stored = localStorage.getItem("vakaygo_currency");
    if (stored && EXCHANGE_RATES[stored]) {
      setCurrencyState(stored);
    }
  }, []);

  const setCurrency = useCallback((code: string) => {
    if (EXCHANGE_RATES[code]) {
      setCurrencyState(code);
      localStorage.setItem("vakaygo_currency", code);
    }
  }, []);

  const convert = useCallback(
    (amount: number) => amount * (EXCHANGE_RATES[currency] || 1),
    [currency],
  );

  const format = useCallback(
    (amount: number) => {
      const converted = amount * (EXCHANGE_RATES[currency] || 1);
      const sym = CURRENCY_SYMBOLS[currency] || "$";
      return `${sym}${converted.toFixed(2)}`;
    },
    [currency],
  );

  const symbol = CURRENCY_SYMBOLS[currency] || "$";

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, convert, format, symbol }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
