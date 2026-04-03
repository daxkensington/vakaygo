"use client";

import { useCurrency, CURRENCY_SYMBOLS } from "@/lib/currency";

type PriceDisplayProps = {
  /** Amount in the base currency */
  amount: number;
  /** Base currency code (default: "USD") */
  baseCurrency?: string;
  /** Show the original currency on hover (default: true) */
  showOriginal?: boolean;
  /** Additional className for the wrapper */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
};

export function PriceDisplay({
  amount,
  baseCurrency = "USD",
  showOriginal = true,
  className = "",
  size = "md",
}: PriceDisplayProps) {
  const { currency, convert, format, ratesLoading } = useCurrency();

  const convertedAmount = convert(amount, baseCurrency);
  const displayPrice = format(amount, baseCurrency);
  const isSameCurrency = currency === baseCurrency;

  // Original price text for hover
  const baseSym = CURRENCY_SYMBOLS[baseCurrency] || "$";
  const originalText = `${baseSym}${amount.toFixed(2)} ${baseCurrency}`;

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-3xl",
  };

  return (
    <span
      className={`inline-flex items-baseline gap-1 ${sizeClasses[size]} ${className}`}
      title={
        showOriginal && !isSameCurrency
          ? `\u2248 ${originalText}`
          : undefined
      }
    >
      <span className={`font-bold text-navy-700 ${ratesLoading ? "opacity-70" : ""}`}>
        {displayPrice}
      </span>
      {showOriginal && !isSameCurrency && (
        <span className="text-navy-300 text-xs font-normal">
          ({originalText})
        </span>
      )}
    </span>
  );
}
