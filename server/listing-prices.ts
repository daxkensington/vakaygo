import { sql, type SQL } from "drizzle-orm";
import { listings } from "@/drizzle/schema";
import { SUPPORTED_CURRENCIES } from "@/server/exchange-rates";

/** Comparable discovery estimate only. Booking/payment calculations retain the listing currency. */
export function listingPriceInUsd(rates: Record<string, number>, bookable: SQL<boolean>): SQL<number | null> {
  const conversions = SUPPORTED_CURRENCIES.flatMap(code => {
    const rate = rates[code];
    return Number.isFinite(rate) && rate > 0
      ? [sql`WHEN upper(trim(${listings.priceCurrency}))=${code} THEN ${listings.priceAmount}/${rate}::numeric`]
      : [];
  });
  if (conversions.length === 0) return sql`NULL::numeric`;
  return sql`CASE WHEN ${bookable} AND ${listings.priceAmount} >= 0
    AND ${listings.priceAmount}::text NOT IN ('NaN','Infinity','-Infinity')
    THEN CASE ${sql.join(conversions, sql` `)} ELSE NULL::numeric END
    ELSE NULL::numeric END`;
}
