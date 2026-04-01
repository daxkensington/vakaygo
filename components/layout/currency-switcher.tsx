"use client";

import { useState } from "react";
import { useCurrency, CURRENCIES, CURRENCY_NAMES } from "@/lib/currency";

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

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Change currency"
        className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-gold-500"
      >
        <span className="font-semibold">{CURRENCY_SYMBOLS[currency]}</span>
        <span className="hidden sm:inline">{currency}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-[var(--shadow-elevated)] py-2 min-w-[220px] border border-cream-200">
            {CURRENCIES.map((code) => (
              <button
                key={code}
                onClick={() => {
                  setCurrency(code);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-cream-50 transition-colors ${
                  currency === code
                    ? "text-gold-600 font-semibold bg-gold-50"
                    : "text-navy-600"
                }`}
              >
                <span className="font-semibold w-10">{CURRENCY_SYMBOLS[code]}</span>
                <span className="font-medium">{code}</span>
                <span className="text-navy-400 text-xs ml-auto">{CURRENCY_NAMES[code]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
