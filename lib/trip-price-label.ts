import { CURRENCIES } from "@/lib/currency";

/** A saved itinerary must not relabel an imported price as USD or as admission. */
export function tripPriceLabel(listing: { bookingEligible?: boolean; priceAmount: string | null; priceCurrency: string | null; priceUnit: string | null }): string | null {
  const currency = listing.priceCurrency?.trim().toUpperCase() ?? "";
  const amount = Number(listing.priceAmount);
  if (listing.bookingEligible !== true || !CURRENCIES.includes(currency) || !Number.isFinite(amount) || amount <= 0) return null;
  const price = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
  return listing.priceUnit?.trim() ? `${price} / ${listing.priceUnit.trim()}` : price;
}
