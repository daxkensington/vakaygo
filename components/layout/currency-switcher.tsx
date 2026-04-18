"use client";

import { useState, useEffect, useRef } from "react";
import {
  useCurrency,
  POPULAR_CURRENCIES,
  CARIBBEAN_CURRENCIES,
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  CURRENCY_FLAGS,
} from "@/lib/currency";

function timeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return "1 hour ago";
  return `${hrs} hours ago`;
}

export function CurrencySwitcher() {
  const { currency, setCurrency, rates, ratesUpdatedAt, ratesLoading } = useCurrency();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  // Preview: show what $100 USD converts to in each currency
  const previewAmount = 100;

  function renderCurrencyOption(code: string) {
    const rate = rates[code] || 1;
    const preview = (previewAmount * rate).toFixed(2);

    return (
      <button
        key={code}
        onClick={() => {
          setCurrency(code);
          setOpen(false);
        }}
        className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-cream-50 transition-colors ${
          currency === code
            ? "text-gold-700 font-semibold bg-gold-50"
            : "text-navy-600"
        }`}
      >
        <span className="text-base leading-none">{CURRENCY_FLAGS[code]}</span>
        <span className="font-semibold w-10">{CURRENCY_SYMBOLS[code]}</span>
        <span className="font-medium">{code}</span>
        <span className="text-navy-300 text-xs ml-auto">
          {CURRENCY_SYMBOLS[code]}{preview}
        </span>
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Select currency"
        aria-expanded={open}
        title={
          ratesUpdatedAt
            ? `Rates updated ${timeAgo(ratesUpdatedAt)}`
            : ratesLoading
              ? "Loading live rates..."
              : "Using approximate rates"
        }
        className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-gold-500"
      >
        <span className="text-base leading-none">{CURRENCY_FLAGS[currency]}</span>
        <span className="font-semibold">{CURRENCY_SYMBOLS[currency]}</span>
        <span className="hidden sm:inline">{currency}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-[var(--shadow-elevated)] py-2 min-w-[280px] border border-cream-200">
            {/* Rates status */}
            {ratesUpdatedAt && (
              <div className="px-4 py-1.5 text-[10px] text-navy-300">
                Rates updated {timeAgo(ratesUpdatedAt)}
                {ratesLoading && " (refreshing...)"}
              </div>
            )}

            {/* Popular currencies */}
            <div className="px-4 pt-1 pb-1">
              <span className="text-[10px] font-semibold text-navy-300 uppercase tracking-wider">
                Popular
              </span>
            </div>
            {POPULAR_CURRENCIES.map(renderCurrencyOption)}

            {/* Divider */}
            <div className="my-1 border-t border-cream-100" />

            {/* Caribbean currencies */}
            <div className="px-4 pt-1 pb-1">
              <span className="text-[10px] font-semibold text-navy-300 uppercase tracking-wider">
                Caribbean
              </span>
            </div>
            {CARIBBEAN_CURRENCIES.map(renderCurrencyOption)}
          </div>
        </>
      )}
    </div>
  );
}
